import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver
let running = false

const findFreePort = vi.fn(async () => 54321)
const isContainerRunning = vi.fn(async () => running)
const resolveDcwInvocation = vi.fn(async (name: string) => `dcw ssh-proxy ${name}`)
const detectEditor = vi.fn(async () => undefined as string | undefined)
const launchEditor = vi.fn(async (_opts: { editor: string; alias: string; folder: string }) => true)
const provisionContainerSsh = vi.fn(async (_o: unknown) => {})
const startSshDaemon = vi.fn(async (_d: unknown, _c: string) => {})

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return {
    ...actual,
    resolveEngineFor: vi.fn(async () => ({ driver, engineName: driver.name, capabilities: driver.capabilities })),
  }
})
vi.mock('../../src/core/ssh/attach.js', async (orig) => {
  const actual = await orig<typeof import('../../src/core/ssh/attach.js')>()
  return {
    ...actual,
    findFreePort: () => findFreePort(),
    isContainerRunning: () => isContainerRunning(),
    resolveDcwInvocation: (n: string) => resolveDcwInvocation(n),
  }
})
vi.mock('../../src/core/ssh/editors.js', async (orig) => {
  const actual = await orig<typeof import('../../src/core/ssh/editors.js')>()
  return { ...actual, detectEditor: () => detectEditor(), launchEditor: (o: never) => launchEditor(o) }
})
vi.mock('../../src/core/ssh/provision.js', () => ({
  provisionContainerSsh: (o: unknown) => provisionContainerSsh(o),
  startSshDaemon: (d: unknown, c: string) => startSshDaemon(d, c),
}))
vi.mock('../../src/core/ssh/keys.js', async (orig) => {
  const actual = await orig<typeof import('../../src/core/ssh/keys.js')>()
  return {
    ...actual,
    // The real one shells out to ssh-keygen; the command only needs the paths.
    ensureKeypair: async () => ({
      privateKeyPath: `${process.env.XDG_CONFIG_HOME}/dcw/ssh/id_ed25519`,
      publicKeyPath: `${process.env.XDG_CONFIG_HOME}/dcw/ssh/id_ed25519.pub`,
      publicKey: 'ssh-ed25519 AAAA dcw-attach',
    }),
  }
})

const { default: Attach } = await import('../../src/commands/attach.js')
const { loadManifest, saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>
let prevHome: string | undefined

const base = { folder: '/workspace', print: false, strict: false, 'no-input': false, yes: false }

const started = (over: Record<string, unknown> = {}, spec: Record<string, unknown> = {}) =>
  manifest({
    name: 'env1',
    engine: 'docker',
    spec: { name: 'env1', engine: 'auto', selections: {}, hardening: [], ssh: true, ...spec } as never,
    image: { tag: 'dcw/env1:latest', containerfileHash: 'h', imageId: 'sha256:1' },
    container: { id: 'cid-1', name: 'dcw-env1', status: 'running', appliedFlags: ['--cap-drop=ALL'], ...over } as never,
  })

async function sshConfig(): Promise<string> {
  return fs.readFile(path.join(os.homedir(), '.ssh', 'config'), 'utf8')
}

beforeEach(async () => {
  state = await useTempState('dcw-attach-')
  prevHome = process.env.HOME
  // os.homedir() honors $HOME on POSIX, so ~/.ssh/config lands in the temp dir.
  process.env.HOME = path.join(state.dir, 'home')
  await fs.mkdir(process.env.HOME, { recursive: true })
  driver = new FakeDriver({ name: 'docker', displayName: 'Docker' })
  running = false
  for (const m of [findFreePort, isContainerRunning, resolveDcwInvocation, detectEditor, launchEditor, provisionContainerSsh, startSshDaemon]) {
    m.mockClear()
  }
  detectEditor.mockResolvedValue(undefined)
  launchEditor.mockResolvedValue(true)
})

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HOME
  else process.env.HOME = prevHome
  await state.cleanup()
  vi.clearAllMocks()
})

describe('dcw attach (validation)', () => {
  it('rejects a relative --folder before touching any environment', async () => {
    // Zed's remote form is a URL, so a relative folder yields a malformed target.
    await expect(runCommand(Attach, { flags: { ...base, folder: 'work' }, json: true })).rejects.toMatchObject({
      code: 'E_VALIDATION',
      message: expect.stringContaining('--folder /workspace'),
    })
  })

  it('refuses an environment created with --no-ssh', async () => {
    await saveManifest(started({}, { ssh: false }))
    await expect(runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })).rejects.toMatchObject({
      code: 'E_VALIDATION',
      message: expect.stringContaining('--no-ssh'),
    })
  })

  it('refuses --port on an air-gapped environment WITHOUT destroying the running container', async () => {
    await saveManifest(started({}, { hardening: ['network-none'] }))
    running = true
    await expect(
      runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, port: 0 }, json: true }),
    ).rejects.toMatchObject({ code: 'E_VALIDATION', message: expect.stringContaining('without --port') })
    expect(driver.rms).toEqual([])
    expect(driver.runs).toEqual([])
  })
})

describe('dcw attach (exec proxy mode)', () => {
  it('reuses a running container and writes a ProxyCommand ssh config block', async () => {
    await saveManifest(started())
    running = true

    const { result } = await runCommand<Record<string, any>>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: true,
    })

    expect(result).toMatchObject({
      name: 'env1',
      engine: 'docker',
      host: 'dcw-env1',
      mode: 'exec',
      port: undefined,
      user: 'vscode',
      folder: '/workspace',
      ssh: 'ssh dcw-env1',
      launched: false,
    })
    expect(driver.runs).toEqual([])
    const cfg = await sshConfig()
    expect(cfg).toContain('Host dcw-env1')
    expect(cfg).toContain('ProxyCommand dcw ssh-proxy env1')
    // No listening daemon is needed when SSH rides the engine's exec channel.
    expect(startSshDaemon).not.toHaveBeenCalled()
  })

  it('starts the container when it is not running', async () => {
    await saveManifest(started())
    running = false
    await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })
    expect(driver.runs).toHaveLength(1)
    expect(driver.runs[0]?.flags.some((f) => f.startsWith('-p'))).toBe(false)
  })

  it('mounts --workspace when it has to start the container', async () => {
    await saveManifest(started())
    await runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, workspace: '/host/ws' }, json: true })
    expect(driver.runs[0]?.flags).toContain('/host/ws:/workspace')
  })

  it("resolves the engine from the spec when the manifest has none recorded yet", async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        engine: null,
        spec: { name: 'env1', engine: 'podman', selections: {}, hardening: [], ssh: true },
        image: { tag: 'dcw/env1:latest', containerfileHash: 'h', imageId: 'sha256:1' },
        container: { id: 'cid-1', name: 'dcw-env1', status: 'running', appliedFlags: [] } as never,
      }),
    )
    running = true
    const { result } = await runCommand<{ engine: string }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: true,
    })
    expect(result?.engine).toBe('docker')
  })

  it('addresses the container by name when no id was recorded', async () => {
    await saveManifest(started({ id: undefined }))
    running = true
    await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })
    expect(provisionContainerSsh).toHaveBeenCalledWith(expect.objectContaining({ container: 'dcw-env1' }))
  })

  it('installs the attach key and records the ssh mode on the manifest', async () => {
    await saveManifest(started())
    running = true
    await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })

    expect(provisionContainerSsh).toHaveBeenCalledWith(
      expect.objectContaining({ container: 'cid-1', hostAlias: 'dcw-env1', publicKey: 'ssh-ed25519 AAAA dcw-attach' }),
    )
    expect((await loadManifest('env1'))?.container?.ssh).toEqual({ mode: 'exec' })
  })
})

describe('dcw attach (published-port mode)', () => {
  it('auto-allocates a free port with --port 0 and starts a listening daemon', async () => {
    await saveManifest(started())
    const { result } = await runCommand<{ mode: string; port: number }>(Attach, {
      args: { name: 'env1' },
      flags: { ...base, port: 0 },
      json: true,
    })

    expect(result).toMatchObject({ mode: 'port', port: 54321 })
    expect(driver.runs[0]?.flags).toContain('127.0.0.1:54321:2222')
    expect(startSshDaemon).toHaveBeenCalledWith(driver, 'cid-dcw-env1')
    const cfg = await sshConfig()
    expect(cfg).toContain('HostName localhost')
    expect(cfg).toContain('Port 54321')
    expect(cfg).not.toContain('ProxyCommand')
  })

  it('uses an explicit --port verbatim', async () => {
    await saveManifest(started())
    const { result } = await runCommand<{ port: number }>(Attach, {
      args: { name: 'env1' },
      flags: { ...base, port: 2222 },
      json: true,
    })
    expect(result?.port).toBe(2222)
    expect(findFreePort).not.toHaveBeenCalled()
  })

  it('reuses a running container already published on the requested port', async () => {
    await saveManifest(started({ ssh: { mode: 'port', port: 2222 } }))
    running = true
    const { result } = await runCommand<{ port: number }>(Attach, {
      args: { name: 'env1' },
      flags: { ...base, port: 2222 },
      json: true,
    })
    expect(result?.port).toBe(2222)
    expect(driver.runs).toEqual([])
  })

  it('accepts any existing published port when --port 0 asks for "some" port', async () => {
    await saveManifest(started({ ssh: { mode: 'port', port: 40000 } }))
    running = true
    const { result } = await runCommand<{ port: number }>(Attach, {
      args: { name: 'env1' },
      flags: { ...base, port: 0 },
      json: true,
    })
    expect(result?.port).toBe(40000)
    expect(driver.runs).toEqual([])
  })

  it('restarts the container when the running one is published on a different port', async () => {
    await saveManifest(started({ ssh: { mode: 'port', port: 40000 } }))
    running = true
    await runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, port: 2222 }, json: true })
    expect(driver.runs).toHaveLength(1)
    expect(driver.runs[0]?.flags).toContain('127.0.0.1:2222:2222')
  })

  it('restarts the container when the running one is in exec mode', async () => {
    await saveManifest(started({ ssh: { mode: 'exec' } }))
    running = true
    await runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, port: 2222 }, json: true })
    expect(driver.runs).toHaveLength(1)
  })
})

describe('dcw attach (--strict)', () => {
  it('refuses to hand an editor a reused container whose hardening was dropped', async () => {
    await saveManifest(started({ droppedHardening: ['network-none'] }))
    running = true
    await expect(
      runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, strict: true }, json: true }),
    ).rejects.toMatchObject({ code: 'E_STRICT_HARDENING' })
    // A refusal must leave no trace: no keys provisioned, no ssh config written.
    expect(provisionContainerSsh).not.toHaveBeenCalled()
    await expect(sshConfig()).rejects.toThrow()
  })

  it('judges a reused container by what was recorded at start, not by today\'s capability map', async () => {
    // The container recorded a clean start; the engine map has since tightened.
    await saveManifest(started())
    running = true
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ capDrop: { support: 'unsupported', note: 'newly known limitation' } }),
    })
    const { result } = await runCommand<{ hardening: { dropped: string[]; appliedFlags: string[] } }>(Attach, {
      args: { name: 'env1' },
      flags: { ...base, strict: true },
      json: true,
    })
    expect(result?.hardening).toEqual({
      appliedFlags: ['--cap-drop=ALL'],
      warnings: [],
      dropped: [],
      unenforced: [],
    })
  })

  it('fails a --strict start before force-removing the existing container', async () => {
    await saveManifest(started({ ssh: { mode: 'exec' } }, { hardening: ['apparmor'] }))
    running = true
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM' } }),
    })
    await expect(
      runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, port: 2222, strict: true }, json: true }),
    ).rejects.toMatchObject({ code: 'E_STRICT_HARDENING' })
    expect(driver.rms).toEqual([])
  })
})

describe('dcw attach (hardening report)', () => {
  it('reports the fresh translation when it started the container', async () => {
    await saveManifest(started({}, { hardening: ['apparmor'] }))
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM' } }),
    })
    const { result } = await runCommand<{ hardening: { dropped: string[] } }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: true,
    })
    expect(result?.hardening.dropped).toEqual(['apparmor'])
  })

  it('reports an empty report for a reused container that recorded no flags', async () => {
    await saveManifest(started({ appliedFlags: undefined }))
    running = true
    const { result } = await runCommand<{ hardening: unknown }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: true,
    })
    expect(result?.hardening).toEqual({ appliedFlags: [], warnings: [], dropped: [], unenforced: [] })
  })

  it('falls back to the recorded container state when nothing was started or reused', async () => {
    // No container record at all: the report is empty rather than absent.
    await saveManifest(manifest({ name: 'env1', engine: 'docker' }))
    running = true
    const { result } = await runCommand<{ hardening: unknown }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: true,
    })
    expect(result?.hardening).toEqual({ appliedFlags: [], warnings: [], dropped: [], unenforced: [] })
  })
})

describe('dcw attach (editor launching)', () => {
  it('detects and launches an editor in human mode', async () => {
    await saveManifest(started())
    running = true
    detectEditor.mockResolvedValue('zed')

    const { result, logs } = await runCommand<{ editor?: string; launched: boolean }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: false,
    })

    expect(launchEditor).toHaveBeenCalledWith({ editor: 'zed', alias: 'dcw-env1', folder: '/workspace' })
    expect(result).toMatchObject({ editor: 'zed', launched: true })
    expect(logs[0]).toBe('Ready: dcw-env1 (exec proxy) on Docker.')
    expect(logs[1]).toBe('Launched Zed → /workspace.')
    expect(logs.join('\n')).toContain('code --remote ssh-remote+dcw-env1 /workspace')
    expect(logs.join('\n')).toContain('zed ssh://dcw-env1/workspace')
  })

  it('reports the published port in the ready line', async () => {
    await saveManifest(started())
    const { logs } = await runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, port: 0 }, json: false })
    expect(logs.some((l) => l === 'Ready: dcw-env1 (localhost:54321) on Docker.')).toBe(true)
  })

  it('raises when an explicitly requested editor is not installed', async () => {
    await saveManifest(started())
    running = true
    launchEditor.mockResolvedValue(false)
    await expect(
      runCommand(Attach, { args: { name: 'env1' }, flags: { ...base, editor: 'cursor' }, json: false }),
    ).rejects.toThrow("Editor 'cursor' is not installed")
  })

  it('stays silent when an auto-detected editor fails to launch', async () => {
    await saveManifest(started())
    running = true
    detectEditor.mockResolvedValue('zed')
    launchEditor.mockResolvedValue(false)
    const { result } = await runCommand<{ launched: boolean }>(Attach, {
      args: { name: 'env1' },
      flags: base,
      json: false,
    })
    expect(result?.launched).toBe(false)
  })

  it('launches nothing under --print, --json, --no-input or --editor none', async () => {
    await saveManifest(started())
    running = true
    detectEditor.mockResolvedValue('zed')

    for (const flags of [
      { ...base, print: true },
      { ...base, 'no-input': true },
      { ...base, editor: 'none' },
    ]) {
      launchEditor.mockClear()
      const { result } = await runCommand<{ editor?: string; launched: boolean }>(Attach, {
        args: { name: 'env1' },
        flags,
        json: false,
      })
      expect(launchEditor).not.toHaveBeenCalled()
      expect(result).toMatchObject({ editor: undefined, launched: false })
    }

    launchEditor.mockClear()
    await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })
    expect(launchEditor).not.toHaveBeenCalled()
  })

  it('prints nothing to stdout under --json', async () => {
    await saveManifest(started())
    running = true
    const { logs } = await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: true })
    expect(logs).toEqual([])
  })

  it('logs build and start lines, plus hardening warnings, when it starts the container', async () => {
    await saveManifest(manifest({ name: 'env1', engine: 'docker', spec: { name: 'env1', engine: 'auto', selections: {}, hardening: ['apparmor'], ssh: true } }))
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM' } }),
    })
    const { logs, warns } = await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: false })
    expect(logs[0]).toBe('Built dcw/env1:latest.')
    expect(logs[1]).toBe('Started dcw-env1 on Docker.')
    expect(warns).toEqual(['dropped [apparmor]: no LSM'])
  })

  it('prefixes advisory hardening notes with "note" rather than "dropped"', async () => {
    await saveManifest(manifest({ name: 'env1', engine: 'docker', spec: { name: 'env1', engine: 'auto', selections: {}, hardening: ['apparmor'], ssh: true } }))
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'caveated', note: 'best effort only' } }),
    })
    const { warns } = await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: false })
    expect(warns).toEqual(['note [apparmor]: best effort only'])
  })

  it('skips the build line when the image is already up to date', async () => {
    await saveManifest(manifest({ name: 'env1', engine: 'docker' }))
    await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: false })
    running = false
    const { logs } = await runCommand(Attach, { args: { name: 'env1' }, flags: base, json: false })
    expect(logs.some((l) => l.startsWith('Built '))).toBe(false)
  })
})
