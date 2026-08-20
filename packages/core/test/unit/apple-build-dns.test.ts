import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EngineDnsError, ExitCode } from '../../src/errors.js'
import type { CaptureResult } from '../../src/engine/exec.js'

// The exec layer is the only I/O these paths do; script it per test so the probe
// can be exercised without touching the host or the `container` CLI.
const capture = vi.fn(async (_bin: string, _args: string[]): Promise<CaptureResult> => ok(''))
const inherit = vi.fn(async (): Promise<number> => 1)

vi.mock('../../src/engine/exec.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/exec.js')>()
  return { ...actual, capture: (b: string, a: string[]) => capture(b, a), inherit: () => inherit() }
})

const {
  appleBuildDnsMessage,
  conflictingPort53Binders,
  diagnoseAppleBuildDns,
  gatewayDnsUnavailable,
  parseBuilderNameservers,
  parseNetworkGateway,
  parsePort53Listeners,
  probeAppleBuildDns,
} = await import('../../src/engine/dns-preflight.js')
const { AppleContainerDriver } = await import('../../src/engine/drivers/apple-container.js')

const ok = (stdout: string): CaptureResult => ({ code: 0, stdout, stderr: '', spawnError: false })

const GW = '192.168.64.1'

// Captured verbatim from `netstat -an -p udp` on a macOS 26 host where Cloudflare
// WARP's local DoH proxy holds :53 on two loopback addresses. Note the asymmetry
// that is the signature of apple/container#402: the IPv6 wildcard bind succeeded,
// the IPv4 wildcard bind did not, so the gateway has no v4 resolver.
const BROKEN_NETSTAT = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)
udp6       0      0  *.53                   *.*
udp4       0      0  127.0.2.3.53           *.*
udp4       0      0  127.0.2.2.53           *.*
udp4       0      0  *.5353                 *.*
`

const HEALTHY_NETSTAT = `Active Internet connections (including servers)
Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)
udp6       0      0  *.53                   *.*
udp4       0      0  *.53                   *.*
`

describe('parsePort53Listeners', () => {
  it('keeps only port 53 and splits the address off the LAST dot', () => {
    expect(parsePort53Listeners(BROKEN_NETSTAT)).toEqual([
      { family: 'inet6', address: '*' },
      { family: 'inet', address: '127.0.2.3' },
      { family: 'inet', address: '127.0.2.2' },
    ])
  })

  it('does not mistake port 5353 (mDNS) for port 53', () => {
    const addrs = parsePort53Listeners(BROKEN_NETSTAT).map((l) => l.address)
    expect(addrs).not.toContain('*.5353')
    expect(parsePort53Listeners(BROKEN_NETSTAT)).toHaveLength(3)
  })

  it('handles scoped IPv6 local addresses', () => {
    const rows = 'udp6       0      0  fe80::1%lo0.53         *.*\n'
    expect(parsePort53Listeners(rows)).toEqual([{ family: 'inet6', address: 'fe80::1%lo0' }])
  })

  it('ignores tcp rows and header noise', () => {
    const rows = 'Proto Recv-Q Send-Q  Local Address\ntcp4       0      0  127.0.2.2.53           *.*     LISTEN\n'
    expect(parsePort53Listeners(rows)).toEqual([])
  })
})

describe('gatewayDnsUnavailable', () => {
  it('is true when only specific loopback addresses hold IPv4 :53', () => {
    expect(gatewayDnsUnavailable(parsePort53Listeners(BROKEN_NETSTAT), GW)).toBe(true)
  })

  it('is false once something holds the IPv4 wildcard', () => {
    expect(gatewayDnsUnavailable(parsePort53Listeners(HEALTHY_NETSTAT), GW)).toBe(false)
  })

  it('is false when a resolver is bound to the gateway address itself', () => {
    expect(gatewayDnsUnavailable([{ family: 'inet', address: GW }], GW)).toBe(false)
  })

  it('ignores the IPv6 wildcard — the guest resolves via the IPv4 gateway', () => {
    // This is the exact trap: `*:53` shows up in netstat and looks healthy, but it
    // is udp6 only, so the container's `nameserver 192.168.64.1` still answers nothing.
    expect(gatewayDnsUnavailable([{ family: 'inet6', address: '*' }], GW)).toBe(true)
  })
})

describe('conflictingPort53Binders', () => {
  it('names the IPv4 squatters that blocked the wildcard bind, deduped', () => {
    const listeners = [...parsePort53Listeners(BROKEN_NETSTAT), { family: 'inet' as const, address: '127.0.2.2' }]
    expect(conflictingPort53Binders(listeners, GW)).toEqual(['127.0.2.3:53', '127.0.2.2:53'])
  })

  it('does not name the gateway or the wildcard as conflicts', () => {
    expect(conflictingPort53Binders([{ family: 'inet', address: '*' }, { family: 'inet', address: GW }], GW)).toEqual([])
  })
})

describe('diagnoseAppleBuildDns', () => {
  const listeners = parsePort53Listeners(BROKEN_NETSTAT)

  it('blocks when the builder has no resolvers of its own and the gateway is dead', () => {
    const d = diagnoseAppleBuildDns({ builderNameservers: [], gatewayIpv4: GW, listeners })
    expect(d.blocked).toBe(true)
    expect(d.conflicting).toContain('127.0.2.2:53')
  })

  it('blocks when the builder was pointed explicitly at the dead gateway', () => {
    expect(diagnoseAppleBuildDns({ builderNameservers: [GW], gatewayIpv4: GW, listeners }).blocked).toBe(true)
  })

  it('does NOT blame DNS when the builder has its own public resolvers', () => {
    // `container builder start --dns 1.1.1.1 --dns 1.0.0.1` — a build failing here
    // is a real Containerfile failure and must keep its own error.
    const d = diagnoseAppleBuildDns({ builderNameservers: ['1.1.1.1', '1.0.0.1'], gatewayIpv4: GW, listeners })
    expect(d.blocked).toBe(false)
  })

  it('does NOT blame DNS on a host whose gateway resolver is up', () => {
    const d = diagnoseAppleBuildDns({
      builderNameservers: [],
      gatewayIpv4: GW,
      listeners: parsePort53Listeners(HEALTHY_NETSTAT),
    })
    expect(d.blocked).toBe(false)
  })
})

describe('appleBuildDnsMessage', () => {
  it('gives the copy-pasteable builder restart, not a --dns flag that does nothing', () => {
    const msg = appleBuildDnsMessage({ blocked: true, gatewayIpv4: GW, conflicting: ['127.0.2.2:53'] })
    expect(msg).toContain('container builder stop')
    expect(msg).toContain('container builder start --dns 1.1.1.1 --dns 1.0.0.1')
    expect(msg).toContain('`container build --dns` is accepted but ignored')
    expect(msg).toContain(GW)
    expect(msg).toContain('127.0.2.2:53')
  })

  it('still explains itself when no conflicting binder could be named', () => {
    const msg = appleBuildDnsMessage({ blocked: true, gatewayIpv4: GW, conflicting: [] })
    expect(msg).toContain('No host process is bound to port 53')
    expect(msg).toContain('container builder start')
  })
})

describe('inspect parsers', () => {
  it('reads the builder nameservers out of Apple\'s inspect schema', () => {
    const json = JSON.stringify([{ configuration: { dns: { nameservers: ['1.1.1.1'], options: [] } } }])
    expect(parseBuilderNameservers(json)).toEqual(['1.1.1.1'])
  })

  it('treats an absent dns block as "inherits the gateway", not as unparseable', () => {
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: {} }]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: {} } }]))).toEqual([])
  })

  it('returns null (no diagnosis) for shapes it does not recognise', () => {
    expect(parseBuilderNameservers('not json')).toBeNull()
    expect(parseBuilderNameservers('[]')).toBeNull()
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: { nameservers: 'x' } } }]))).toBeNull()
  })

  it('reads the IPv4 gateway out of `container network inspect`', () => {
    const json = JSON.stringify([{ id: 'default', status: { ipv4Gateway: GW, ipv4Subnet: '192.168.64.0/24' } }])
    expect(parseNetworkGateway(json)).toBe(GW)
    expect(parseNetworkGateway('[]')).toBeNull()
    expect(parseNetworkGateway(JSON.stringify([{ status: {} }]))).toBeNull()
  })
})

describe('probeAppleBuildDns / AppleContainerDriver.build', () => {
  const INSPECT_NO_DNS = JSON.stringify([{ configuration: { dns: { nameservers: [] } } }])
  const INSPECT_WITH_DNS = JSON.stringify([{ configuration: { dns: { nameservers: ['1.1.1.1'] } } }])
  const NETWORK = JSON.stringify([{ status: { ipv4Gateway: GW } }])

  function stubHost(inspectJson: string, netstat: string) {
    capture.mockImplementation(async (bin, args) => {
      if (bin === 'netstat') return ok(netstat)
      if (args[0] === 'inspect') return ok(inspectJson)
      if (args[0] === 'network') return ok(NETWORK)
      // `image inspect <tag> --format` after a build — irrelevant here.
      return ok('')
    })
  }

  beforeEach(() => {
    capture.mockReset()
    // The build itself always fails; the question is which error the user sees.
    inherit.mockReset().mockResolvedValue(1)
  })

  const spec = { containerfilePath: '/tmp/Containerfile', contextDir: '/tmp', tag: 'dcw/demo:latest' }

  it('probes read-only commands only', async () => {
    stubHost(INSPECT_NO_DNS, BROKEN_NETSTAT)
    await probeAppleBuildDns()
    const calls = capture.mock.calls.map(([bin, args]) => `${bin} ${args.join(' ')}`)
    expect(calls).toEqual([
      'container inspect buildkit',
      'container network inspect default',
      'netstat -an -p udp',
    ])
  })

  it('turns a DNS-starved build failure into E_ENGINE_DNS with exit 10', async () => {
    stubHost(INSPECT_NO_DNS, BROKEN_NETSTAT)
    const err = await new AppleContainerDriver().build(spec).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EngineDnsError)
    expect((err as EngineDnsError).code).toBe('E_ENGINE_DNS')
    expect((err as EngineDnsError).exitCode).toBe(ExitCode.EngineDns)
    expect((err as Error).message).toContain('container builder start --dns')
  })

  it('leaves a genuine build failure alone when the builder has working DNS', async () => {
    stubHost(INSPECT_WITH_DNS, BROKEN_NETSTAT)
    const err = await new AppleContainerDriver().build(spec).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(EngineDnsError)
    expect((err as Error).message).toContain('build failed')
  })

  it('leaves a genuine build failure alone on a host with a healthy gateway resolver', async () => {
    stubHost(INSPECT_NO_DNS, HEALTHY_NETSTAT)
    const err = await new AppleContainerDriver().build(spec).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(EngineDnsError)
  })

  it('fails open when a probe command errors — the real build error survives', async () => {
    capture.mockResolvedValue({ code: 1, stdout: '', stderr: 'nope', spawnError: false })
    const err = await new AppleContainerDriver().build(spec).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(EngineDnsError)
    expect(await probeAppleBuildDns()).toBeNull()
  })

  it('never runs the probe when the build succeeds', async () => {
    inherit.mockResolvedValue(0)
    stubHost(INSPECT_NO_DNS, BROKEN_NETSTAT)
    await new AppleContainerDriver().build(spec)
    const probed = capture.mock.calls.some(([bin]) => bin === 'netstat')
    expect(probed).toBe(false)
  })
})

describe('the dns capability note tells the truth about run vs build', () => {
  const cap = new AppleContainerDriver().capabilities.dns

  it('does not drop secure-dns — `container run --dns` genuinely works', () => {
    expect(cap.support).toBe('caveated')
    expect(cap.enforced).not.toBe(false)
  })

  it('names the build path as the gap, instead of "support is limited"', () => {
    expect(cap.note).not.toMatch(/support is limited/i)
    expect(cap.note).toContain('container build')
    expect(cap.note).toContain('buildkit')
    expect(cap.note).toContain('container builder start')
  })
})
