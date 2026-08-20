import { describe, expect, it } from 'vitest'
import { parseAppleList } from '../../src/engine/drivers/apple-container.js'
import { parsePsJson } from '../../src/engine/drivers/cli-driver.js'
import { parseBuilderNameservers, parseNetworkGateway } from '../../src/engine/dns-preflight.js'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { enginePlatformSupport, enginePreference } from '../../src/engine/host.js'
import { resolveEngine } from '../../src/engine/resolver.js'
import { inherit } from '../../src/engine/exec.js'
import { capabilityFor } from '../../src/hardening/effects.js'
import { enforceStrict, translate } from '../../src/hardening/translator.js'
import { renderEntry } from '../../src/core/ssh/ssh-config.js'
import { upEnvironment } from '../../src/core/up-pipeline.js'
import { planEnvironment } from '../../src/core/plan.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest } from '../helpers/fixtures.js'

describe('host support fallbacks', () => {
  it('refuses an engine name it does not know', () => {
    expect(enginePlatformSupport('nerdctl' as never, { os: 'linux', arch: 'x64' })).toEqual({
      supported: false,
      reason: 'Unknown engine.',
    })
  })

  it('offers a preference order for every host, narrowing off macOS and Linux', () => {
    expect(enginePreference({ os: 'macos', arch: 'arm64' })).toEqual([
      'orbstack',
      'docker',
      'podman',
      'apple-container',
      'lima',
    ])
    expect(enginePreference({ os: 'linux', arch: 'x64' })).toEqual(['docker', 'podman', 'lima'])
    // Windows and unknown hosts get only the engines that are portable.
    expect(enginePreference({ os: 'windows', arch: 'x64' })).toEqual(['docker', 'podman'])
    expect(enginePreference({ os: 'other', arch: 'other' })).toEqual(['docker', 'podman'])
  })
})

describe('resolveEngine', () => {
  const host = { os: 'linux' as const, arch: 'x64' as const }

  it('rejects a requested engine that has no driver', async () => {
    await expect(resolveEngine({ requested: 'nerdctl', host, drivers: [] })).rejects.toMatchObject({
      code: 'E_ENGINE_UNSUPPORTED',
      message: "Unknown engine 'nerdctl'.",
    })
  })

  it('rejects a requested engine the host cannot run', async () => {
    const orbstack = new FakeDriver({ name: 'orbstack' })
    await expect(resolveEngine({ requested: 'orbstack', host, drivers: [orbstack] })).rejects.toMatchObject({
      code: 'E_ENGINE_UNSUPPORTED',
      message: expect.stringContaining('OrbStack runs on macOS only.'),
    })
  })

  it('falls back to a generic reason when a requested engine reports none', async () => {
    const docker = new FakeDriver({ name: 'docker', detect: { available: false } })
    await expect(resolveEngine({ requested: 'docker', host, drivers: [docker] })).rejects.toMatchObject({
      code: 'E_ENGINE_UNAVAILABLE',
      message: "Engine 'docker' is supported but not available: not detected.",
    })
  })

  it('auto-detects the first available engine in host preference order', async () => {
    const docker = new FakeDriver({ name: 'docker', detect: { available: false, reason: 'daemon down' } })
    const podman = new FakeDriver({ name: 'podman' })
    const resolved = await resolveEngine({ host, drivers: [podman, docker] })
    // Linux prefers docker, but it is down, so podman wins.
    expect(resolved.driver).toBe(podman)
  })

  it('skips engines with no driver registered and engines this host cannot run', async () => {
    // OrbStack is macOS-only, so on Linux it must be skipped rather than probed.
    const orbstack = new FakeDriver({ name: 'orbstack' })
    const podman = new FakeDriver({ name: 'podman' })
    const resolved = await resolveEngine({ host, drivers: [orbstack, podman] })
    expect(resolved.driver).toBe(podman)
  })

  it('lists what it tried when nothing is available', async () => {
    const docker = new FakeDriver({ name: 'docker', displayName: 'Docker', detect: { available: false, reason: 'daemon down' } })
    // A driver with no reason still gets a readable entry.
    const podman = new FakeDriver({ name: 'podman', displayName: 'Podman', detect: { available: false } })
    await expect(resolveEngine({ host, drivers: [docker, podman] })).rejects.toMatchObject({
      code: 'E_NO_ENGINE',
      message: expect.stringContaining('Tried: Docker (daemon down), Podman (not detected).'),
    })
  })

  it("reports 'none' when there were no candidate engines at all", async () => {
    await expect(resolveEngine({ host, drivers: [] })).rejects.toMatchObject({
      message: expect.stringContaining('Tried: none.'),
    })
  })
})

describe('inherit', () => {
  it('reports 0 for a child killed by a signal, which exits with a null code', async () => {
    expect(await inherit(process.execPath, ['-e', 'process.kill(process.pid, "SIGKILL")'])).toBe(0)
  })
})

describe('capabilityFor', () => {
  it('maps every hardening effect kind to the capability that governs it', () => {
    expect(capabilityFor({ kind: 'readonly-rootfs' })).toBe('readOnlyRootfs')
    expect(capabilityFor({ kind: 'tmpfs', target: '/tmp', opts: 'rw' })).toBe('tmpfs')
    expect(capabilityFor({ kind: 'ephemeral-workspace' })).toBe('tmpfs')
    expect(capabilityFor({ kind: 'drop-cap', cap: 'ALL' })).toBe('capDrop')
    expect(capabilityFor({ kind: 'no-new-privs' })).toBe('noNewPrivs')
    expect(capabilityFor({ kind: 'apparmor', profile: 'docker-default' })).toBe('apparmor')
    expect(capabilityFor({ kind: 'network-none' })).toBe('networkNone')
    expect(capabilityFor({ kind: 'sysctl', key: 'k', value: 'v' })).toBe('sysctl')
    expect(capabilityFor({ kind: 'dns', servers: ['1.1.1.1'] })).toBe('dns')
    expect(capabilityFor({ kind: 'resources', memory: '2g', cpus: '4' })).toBe('memoryLimit')
    // A no-op has no capability to consult; it only ever produces an advisory.
    expect(capabilityFor({ kind: 'noop', source: 'vscode-security', reason: 'y' })).toBeNull()
  })
})

describe('translate warning labels', () => {
  it('names the specific target of a dropped tmpfs, cap-drop or sysctl', () => {
    const effects = [
      { kind: 'tmpfs' as const, target: '/tmp', opts: 'rw' },
      { kind: 'drop-cap' as const, cap: 'NET_RAW' as const },
      { kind: 'sysctl' as const, key: 'net.ipv6.conf.all.disable_ipv6', value: '1' },
    ]
    const result = translate(
      effects,
      caps({
        tmpfs: { support: 'unsupported' },
        capDrop: { support: 'unsupported' },
        sysctl: { support: 'unsupported' },
      }),
      'apple-container',
    )

    expect(result.warnings.map((w) => w.effect)).toEqual([
      'tmpfs /tmp',
      'drop-cap NET_RAW',
      'sysctl net.ipv6.conf.all.disable_ipv6',
    ])
    // With no per-capability note, the message names the engine that dropped it.
    expect(result.warnings[0]?.message).toBe('apple-container does not support this hardening; it was dropped.')
    expect(() => enforceStrict(result)).toThrow(/tmpfs \/tmp, drop-cap NET_RAW, sysctl net\.ipv6/)
  })

  it('emits a caveat with no warning text when the engine gave no note', () => {
    const result = translate(
      [{ kind: 'apparmor', profile: 'docker-default' }],
      caps({ apparmor: { support: 'caveated', enforced: false } }),
      'podman',
    )
    expect(result.warnings).toEqual([])
    expect(result.flags).toEqual(['--security-opt', 'apparmor=docker-default'])
    // Unenforced still blocks --strict, note or no note.
    expect(result.unenforced.map((e) => e.kind)).toEqual(['apparmor'])
  })

  it('treats a caveat as advisory when the engine does enforce it', () => {
    const result = translate(
      [{ kind: 'apparmor', profile: 'docker-default' }],
      caps({ apparmor: { support: 'caveated', note: 'heads up' } }),
      'docker',
    )
    expect(result.unenforced).toEqual([])
    expect(() => enforceStrict(result)).not.toThrow()
  })
})

describe('upEnvironment preconditions', () => {
  it('refuses to start an environment that has no built image', async () => {
    const plan = planEnvironment(EnvSpecSchema.parse({ name: 'env1' }))
    await expect(
      upEnvironment({
        manifest: manifest({ name: 'env1' }),
        plan,
        driver: new FakeDriver({ name: 'docker' }),
        capabilities: caps(),
        engineName: 'docker',
        workspaceDir: '/ws',
        now: '2026-06-11T00:00:00.000Z',
      }),
    ).rejects.toThrow("Environment 'env1' has no built image. Run 'dcw build env1' first.")
  })
})

describe('ssh config rendering', () => {
  it('falls back to the container SSH port when a port entry records none', () => {
    const rendered = renderEntry({
      name: 'env1',
      mode: 'port',
      identityFile: '/k',
      knownHostsFile: '/kh',
    })
    expect(rendered).toContain('HostName localhost')
    expect(rendered).toContain('Port 2222')
  })

  it('pins host-key checking to dcw\'s own known_hosts, never the user\'s', () => {
    const rendered = renderEntry({
      name: 'env1',
      mode: 'exec',
      identityFile: '/k',
      knownHostsFile: '/kh',
      proxyCommand: 'dcw ssh-proxy env1',
    })
    expect(rendered).toContain('UserKnownHostsFile /kh')
    expect(rendered).toContain('IdentitiesOnly yes')
    expect(rendered).toContain('StrictHostKeyChecking accept-new')
  })
})

describe('ps parsing fallbacks', () => {
  it('tolerates a docker row with no id at all', () => {
    expect(parsePsJson('{}')).toEqual([{ id: '', name: '', image: '', status: '', labels: {} }])
  })

  it('drops Apple rows with no usable id, and rows that are not objects', () => {
    const rows = JSON.stringify([null, 'nonsense', {}, { configuration: { id: 'from-config' } }])
    expect(parseAppleList(rows).map((c) => c.id)).toEqual(['from-config'])
  })

  it('defaults Apple image and status when the row omits them', () => {
    expect(parseAppleList(JSON.stringify([{ id: 'x' }]))[0]).toEqual({
      id: 'x',
      name: 'x',
      image: '',
      status: '',
      labels: {},
    })
  })

  it('stringifies non-string Apple label values', () => {
    const rows = JSON.stringify([{ id: 'x', configuration: { labels: { n: 1, b: true } } }])
    expect(parseAppleList(rows)[0]?.labels).toEqual({ n: '1', b: 'true' })
  })

  it('filters Apple rows by bare label presence as well as key=value', () => {
    const rows = JSON.stringify([
      { id: 'a', configuration: { labels: { 'dcw.env': 'a' } } },
      { id: 'b', configuration: { labels: {} } },
    ])
    expect(parseAppleList(rows, 'dcw.env').map((c) => c.id)).toEqual(['a'])
    expect(parseAppleList(rows, 'dcw.env=b')).toEqual([])
  })

  it('returns nothing for output that is not a JSON array', () => {
    expect(parseAppleList('not json')).toEqual([])
    expect(parseAppleList('{"id":"x"}')).toEqual([])
  })
})

describe('Apple DNS preflight parsing', () => {
  it('returns null for output that is not a non-empty JSON array', () => {
    for (const bad of ['not json', '{}', '[]']) {
      expect(parseBuilderNameservers(bad)).toBeNull()
      expect(parseNetworkGateway(bad)).toBeNull()
    }
  })

  it('reads the builder nameservers, treating absent DNS config as "none set"', () => {
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: { nameservers: ['1.1.1.1'] } } }]))).toEqual([
      '1.1.1.1',
    ])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: {} }]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{}]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: null } }]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: { nameservers: null } } }]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: {} } }]))).toEqual([])
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: 'weird' } }]))).toBeNull()
    expect(parseBuilderNameservers(JSON.stringify([{ configuration: { dns: { nameservers: 'weird' } } }]))).toBeNull()
  })

  it('reads the network gateway only when it is a non-empty string', () => {
    expect(parseNetworkGateway(JSON.stringify([{ status: { ipv4Gateway: '192.168.64.1' } }]))).toBe('192.168.64.1')
    expect(parseNetworkGateway(JSON.stringify([{ status: { ipv4Gateway: '' } }]))).toBeNull()
    expect(parseNetworkGateway(JSON.stringify([{ status: {} }]))).toBeNull()
    expect(parseNetworkGateway(JSON.stringify([{}]))).toBeNull()
  })
})
