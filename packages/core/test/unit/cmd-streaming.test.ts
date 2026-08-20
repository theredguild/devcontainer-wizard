import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver

// Mock the engine RESOLVER (not cli/context) so the real context helpers —
// resolveEnvName, requireManifest, execInto — run for these commands.
vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return {
    ...actual,
    resolveEngine: async () => ({ driver, detect: { available: true }, platform: { supported: true } }),
  }
})

vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  // Skip the real `sw_vers` probe: it spawns a subprocess on every resolve.
  return { ...actual, detectHost: async () => ({ os: 'linux', arch: 'x64' }) }
})

const { default: Shell } = await import('../../src/commands/shell.js')
const { default: Exec } = await import('../../src/commands/exec.js')
const { default: Logs } = await import('../../src/commands/logs.js')
const { default: SshProxy } = await import('../../src/commands/ssh-proxy.js')
const { SSHD_CONFIG_PATH } = await import('../../src/containerfile/base.js')
const { saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

const started = (name: string, over: Record<string, unknown> = {}) =>
  manifest({
    name,
    engine: 'docker',
    container: { id: `cid-${name}`, name: `dcw-${name}`, status: 'running', ...over } as never,
  })

beforeEach(async () => {
  state = await useTempState('dcw-stream-')
  driver = new FakeDriver({ name: 'docker' })
})

afterEach(async () => {
  await state.cleanup()
  vi.restoreAllMocks()
})

describe('dcw shell', () => {
  it('execs zsh into the container and exits with the container exit code', async () => {
    await saveManifest(started('env1'))
    driver = new FakeDriver({ name: 'docker', execResult: 42 })

    const { exitCode } = await runCommand(Shell, { args: { name: 'env1' }, flags: {} })

    expect(exitCode).toBe(42)
    expect(driver.execs[0]).toMatchObject({ container: 'cid-env1', cmd: ['zsh'] })
  })

  it('refuses under --strict when the running container lost hardening', async () => {
    await saveManifest(started('env1', { droppedHardening: ['network-none'] }))
    await expect(runCommand(Shell, { args: { name: 'env1' }, flags: { strict: true } })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
  })
})

describe('dcw exec', () => {
  it('treats the first token as the environment when it names one', async () => {
    await saveManifest(started('env1'))
    const { exitCode } = await runCommand(Exec, { argv: ['env1', 'forge', '--version'], flags: {} })
    expect(exitCode).toBe(0)
    expect(driver.execs[0]).toMatchObject({ container: 'cid-env1', cmd: ['forge', '--version'] })
  })

  it('treats the first token as part of the command when it names no environment', async () => {
    await saveManifest(started('only'))
    // The documented `dcw exec -- forge --version` form must not mistake 'forge'
    // for an environment name.
    await runCommand(Exec, { argv: ['forge', '--version'], flags: {} })
    expect(driver.execs[0]).toMatchObject({ container: 'cid-only', cmd: ['forge', '--version'] })
  })

  it('never treats a leading flag-like token as an environment name', async () => {
    await saveManifest(started('only'))
    await runCommand(Exec, { argv: ['--version'], flags: {} })
    expect(driver.execs[0]?.cmd).toEqual(['--version'])
  })

  it('falls back to an interactive zsh when no command is given at all', async () => {
    await saveManifest(started('only'))
    await runCommand(Exec, { argv: [], flags: {} })
    expect(driver.execs[0]?.cmd).toEqual(['zsh'])
  })

  it('propagates the container exit code', async () => {
    await saveManifest(started('only'))
    driver = new FakeDriver({ name: 'docker', execResult: 7 })
    const { exitCode } = await runCommand(Exec, { argv: ['false'], flags: {} })
    expect(exitCode).toBe(7)
  })
})

describe('dcw logs', () => {
  it('streams logs from the recorded container id', async () => {
    await saveManifest(started('env1'))
    const { exitCode } = await runCommand(Logs, { args: { name: 'env1' }, flags: { follow: false } })
    expect(exitCode).toBe(0)
    expect(driver.logsCalls[0]).toEqual({ id: 'cid-env1', opts: { follow: false, tail: undefined } })
  })

  it('forwards --follow and --tail', async () => {
    await saveManifest(started('env1'))
    await runCommand(Logs, { args: { name: 'env1' }, flags: { follow: true, tail: 50 } })
    expect(driver.logsCalls[0]?.opts).toEqual({ follow: true, tail: 50 })
  })

  it('falls back to the derived container name when no id was recorded', async () => {
    await saveManifest(started('env1', { id: undefined }))
    await runCommand(Logs, { args: { name: 'env1' }, flags: {} })
    expect(driver.logsCalls[0]?.id).toBe('dcw-env1')
  })

  it('propagates the exit code of the log stream', async () => {
    await saveManifest(started('env1'))
    driver = new FakeDriver({ name: 'docker', logsResult: 3 })
    const { exitCode } = await runCommand(Logs, { args: { name: 'env1' }, flags: {} })
    expect(exitCode).toBe(3)
  })

  it('raises E_NOT_FOUND when the environment has no container', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await expect(runCommand(Logs, { args: { name: 'env1' }, flags: {} })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
    })
  })

  it("falls back to the spec's engine when none was resolved yet", async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        engine: null,
        spec: { name: 'env1', engine: 'podman', selections: {}, hardening: [], ssh: true },
        container: { id: 'cid-env1', name: 'dcw-env1', status: 'running' } as never,
      }),
    )
    const { exitCode } = await runCommand(Logs, { args: { name: 'env1' }, flags: {} })
    expect(exitCode).toBe(0)
  })
})

describe('dcw ssh-proxy', () => {
  it('execs a one-shot inetd sshd as the vscode user over the engine exec channel', async () => {
    await saveManifest(started('env1'))
    const { exitCode } = await runCommand(SshProxy, { args: { name: 'env1' }, flags: {} })

    expect(exitCode).toBe(0)
    expect(driver.execs[0]).toEqual({
      container: 'cid-env1',
      cmd: ['/usr/sbin/sshd', '-i', '-f', SSHD_CONFIG_PATH],
      interactive: true,
      // No TTY: stdout carries the raw SSH protocol stream, nothing else.
      tty: false,
      user: 'vscode',
    })
  })

  it('falls back to the container name when no id was recorded', async () => {
    await saveManifest(started('env1', { id: undefined }))
    await runCommand(SshProxy, { args: { name: 'env1' }, flags: {} })
    expect(driver.execs[0]?.container).toBe('dcw-env1')
  })

  it('propagates the exit code of the proxied session', async () => {
    await saveManifest(started('env1'))
    driver = new FakeDriver({ name: 'docker', execResult: 255 })
    const { exitCode } = await runCommand(SshProxy, { args: { name: 'env1' }, flags: {} })
    expect(exitCode).toBe(255)
  })

  it('raises E_NOT_FOUND with an `up` hint when the environment has no container', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await expect(runCommand(SshProxy, { args: { name: 'env1' }, flags: {} })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
      message: expect.stringContaining('dcw up env1'),
    })
  })

  it("falls back to the spec's engine when none was resolved yet", async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        engine: null,
        spec: { name: 'env1', engine: 'podman', selections: {}, hardening: [], ssh: true },
        container: { id: 'cid-env1', name: 'dcw-env1', status: 'running' } as never,
      }),
    )
    const { exitCode } = await runCommand(SshProxy, { args: { name: 'env1' }, flags: {} })
    expect(exitCode).toBe(0)
  })
})
