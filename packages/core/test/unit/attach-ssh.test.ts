import { describe, expect, it } from 'vitest'
import { planEnvironment } from '../../src/core/plan.js'
import { renderEntry } from '../../src/core/ssh/ssh-config.js'
import { provisionContainerSsh } from '../../src/core/ssh/provision.js'
import { SSH_CONTAINER_PORT, upEnvironment } from '../../src/core/up-pipeline.js'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { EnvSpecSchema, type EnvSpec } from '../../src/spec/env-spec.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'
import { FakeDriver } from '../engine/fake-driver.js'

const NOW = '2026-06-11T00:00:00.000Z'

function spec(overrides: Partial<EnvSpec> = {}): EnvSpec {
  return EnvSpecSchema.parse({ name: 'demo', hardening: ['drop-caps'], ...overrides })
}

function builtManifest(s: EnvSpec): EnvManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: s.name,
    createdAt: NOW,
    updatedAt: NOW,
    spec: s,
    resolved: { requiredTools: [], hardeningKeys: s.hardening },
    engine: 'docker',
    image: { tag: `dcw/${s.name}:latest`, id: 'sha256:x', containerfileHash: 'h', builtAt: NOW },
    container: null,
  }
}

async function up(s: EnvSpec, sshPublishPort?: number) {
  const driver = new FakeDriver({ name: 'docker' })
  const plan = planEnvironment(s)
  const out = await upEnvironment({
    manifest: builtManifest(s),
    plan,
    driver,
    capabilities: caps(),
    engineName: 'docker',
    workspaceDir: '/tmp/ws',
    sshPublishPort,
    now: NOW,
  })
  return { driver, out }
}

describe('dcw attach — published-port SSH', () => {
  it('publishes the container sshd on loopback only, never all interfaces', async () => {
    const { out } = await up(spec(), 2222)
    const i = out.runSpec.flags.indexOf('-p')
    expect(i).toBeGreaterThanOrEqual(0)
    const mapping = out.runSpec.flags[i + 1]!

    // A bare "2222:2222" makes Docker bind 0.0.0.0, exposing an SSH server on an
    // untrusted-code container to the whole LAN. It must be pinned to loopback.
    expect(mapping).toBe(`127.0.0.1:2222:${SSH_CONTAINER_PORT}`)
    expect(mapping.startsWith('127.0.0.1:')).toBe(true)
  })

  it('records the published port on the manifest', async () => {
    const { out } = await up(spec(), 2222)
    expect(out.manifest.container?.ssh).toEqual({ mode: 'port', port: 2222 })
  })

  it('refuses to publish a port for a network-none (airgapped) environment', async () => {
    await expect(up(spec({ hardening: ['network-none'] }), 2222)).rejects.toThrow(/network-none/)
  })

  it('publishes no port and records no ssh state in exec-proxy mode', async () => {
    const { out } = await up(spec())
    expect(out.runSpec.flags).not.toContain('-p')
    expect(out.manifest.container?.ssh).toBeUndefined()
  })
})

describe('ssh_config rendering', () => {
  it('pins host key checking and uses dcw-managed identity + known_hosts', () => {
    const block = renderEntry({
      name: 'demo',
      mode: 'exec',
      identityFile: '/k/id_ed25519',
      knownHostsFile: '/k/known_hosts',
      proxyCommand: 'dcw ssh-proxy demo',
    })
    expect(block).toContain('Host dcw-demo')
    expect(block).toContain('IdentitiesOnly yes')
    expect(block).toContain('UserKnownHostsFile /k/known_hosts')
    // Must never disable host-key verification outright.
    expect(block).toContain('StrictHostKeyChecking accept-new')
    expect(block).not.toMatch(/StrictHostKeyChecking\s+no/)
  })

  it('uses localhost + the published port in port mode', () => {
    const block = renderEntry({
      name: 'demo',
      mode: 'port',
      identityFile: '/k/id',
      knownHostsFile: '/k/kh',
      port: 2222,
    })
    expect(block).toContain('HostName localhost')
    expect(block).toContain('Port 2222')
    expect(block).not.toContain('ProxyCommand')
  })
})

describe('container ssh provisioning', () => {
  it('passes the public key over stdin, never through argv', async () => {
    const driver = new FakeDriver({ name: 'docker' })
    const publicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI+injected dcw-attach'
    await provisionContainerSsh({ driver, container: 'dcw-demo', publicKey, hostAlias: 'dcw-demo' })

    expect(driver.execs.length).toBeGreaterThan(0)
    for (const e of driver.execs) {
      for (const arg of e.cmd) {
        expect(arg).not.toContain(publicKey)
        expect(arg).not.toContain('AAAAC3NzaC1lZDI1NTE5')
      }
    }
  })

  it('runs provisioning as the unprivileged vscode user', async () => {
    const driver = new FakeDriver({ name: 'docker' })
    await provisionContainerSsh({ driver, container: 'dcw-demo', publicKey: 'ssh-ed25519 AAAA x', hostAlias: 'dcw-demo' })
    for (const e of driver.execs) expect(e.user).toBe('vscode')
  })
})

describe('dcw attach — flag validation', () => {
  it('rejects a relative --folder that would build a malformed ssh:// URL', async () => {
    const { default: Attach } = await import('../../src/commands/attach.js')
    await expect(Attach.run(['demo', '--folder', 'work', '--print'])).rejects.toThrow(
      /--folder must be an absolute path/,
    )
  })
})

describe('dcw attach --port on an air-gapped environment', () => {
  it('refuses before destroying the running container', async () => {
    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const { saveManifest } = await import('../../src/state/store.js')
    const { default: Attach } = await import('../../src/commands/attach.js')

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-attach-'))
    const prevC = process.env.XDG_CONFIG_HOME
    const prevS = process.env.XDG_STATE_HOME
    process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
    process.env.XDG_STATE_HOME = path.join(tmp, 'state')
    try {
      const s = EnvSpecSchema.parse({ name: 'gapped', hardening: ['network-none'] })
      await saveManifest({
        ...builtManifest(s),
        container: { id: 'cid', name: 'dcw-gapped', status: 'running', startedAt: NOW, appliedFlags: [], droppedHardening: [] },
      })
      // Must fail on the plan alone — no engine call, so a live container is never
      // force-removed on the way to an error that was knowable up front.
      await expect(Attach.run(['gapped', '--port', '2222', '--print'])).rejects.toThrow(/network-none/)
    } finally {
      if (prevC === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = prevC
      if (prevS === undefined) delete process.env.XDG_STATE_HOME
      else process.env.XDG_STATE_HOME = prevS
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})
