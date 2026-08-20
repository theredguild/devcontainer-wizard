import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'

let script: Array<{ match: RegExp; result: Partial<CaptureResult> }> = []

vi.mock('../../src/engine/exec.js', () => ({
  capture: async (bin: string, args: string[]): Promise<CaptureResult> => {
    const hit = script.find((s) => s.match.test(`${bin} ${args.join(' ')}`))
    return { code: 0, stdout: '', stderr: '', spawnError: false, ...(hit?.result ?? {}) }
  },
  inherit: async () => 0,
}))

const { parsePort53Listeners, probeAppleBuildDns } = await import('../../src/engine/dns-preflight.js')

const INSPECT = JSON.stringify([{ configuration: { dns: { nameservers: ['192.168.64.1'] } } }])
const NETWORK = JSON.stringify([{ status: { ipv4Gateway: '192.168.64.1' } }])
const NETSTAT = 'Proto Recv-Q Send-Q  Local Address\nudp4       0      0  127.0.0.1.53\n'

function healthy() {
  script = [
    { match: /^container inspect buildkit/, result: { stdout: INSPECT } },
    { match: /^container network inspect default/, result: { stdout: NETWORK } },
    { match: /^netstat/, result: { stdout: NETSTAT } },
  ]
}

beforeEach(() => {
  healthy()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('parsePort53Listeners', () => {
  it('splits the macOS `<addr>.<port>` local address on its LAST dot', () => {
    const rows = [
      'udp4       0      0  127.0.0.2.53          *.*',
      'udp6       0      0  fe80::1%lo0.53        *.*',
      'udp4       0      0  *.53                  *.*',
    ].join('\n')
    expect(parsePort53Listeners(rows)).toEqual([
      { family: 'inet', address: '127.0.0.2' },
      { family: 'inet6', address: 'fe80::1%lo0' },
      { family: 'inet', address: '*' },
    ])
  })

  it('ignores rows that are not UDP, not port 53, short, or missing a port suffix', () => {
    const rows = [
      'tcp4       0      0  127.0.0.1.53          *.*',
      'udp4       0      0  127.0.0.1.5353        *.*',
      'udp4       0      0',
      'udp4       0      0  no-port-here          *.*',
      '',
    ].join('\n')
    expect(parsePort53Listeners(rows)).toEqual([])
  })
})

describe('probeAppleBuildDns', () => {
  it('diagnoses a blocked builder when a non-gateway process squats on port 53', async () => {
    const diag = await probeAppleBuildDns()
    expect(diag).toMatchObject({ blocked: true, gatewayIpv4: '192.168.64.1' })
  })

  it('returns null — never a confident diagnosis — when any probe command fails', async () => {
    for (const failing of [/^container inspect/, /^container network inspect/, /^netstat/]) {
      healthy()
      script.push({ match: failing, result: { code: 1 } })
      script = [script.at(-1)!, ...script.slice(0, -1)]
      expect(await probeAppleBuildDns()).toBeNull()
    }
  })

  it('returns null when the builder DNS config cannot be parsed', async () => {
    healthy()
    script.unshift({ match: /^container inspect buildkit/, result: { stdout: 'not json' } })
    expect(await probeAppleBuildDns()).toBeNull()
  })

  it('returns null when the network gateway cannot be parsed', async () => {
    healthy()
    script.unshift({ match: /^container network inspect default/, result: { stdout: '[]' } })
    expect(await probeAppleBuildDns()).toBeNull()
  })

  it('returns null rather than accusing a healthy host when netstat is unreadable', async () => {
    healthy()
    script.unshift({ match: /^netstat/, result: { stdout: 'unparseable output\n' } })
    expect(await probeAppleBuildDns()).toBeNull()
  })

  it('honors a custom CLI binary name', async () => {
    script = [
      { match: /^mycontainer inspect buildkit/, result: { stdout: INSPECT } },
      { match: /^mycontainer network inspect default/, result: { stdout: NETWORK } },
      { match: /^netstat/, result: { stdout: NETSTAT } },
    ]
    expect(await probeAppleBuildDns('mycontainer')).not.toBeNull()
  })
})
