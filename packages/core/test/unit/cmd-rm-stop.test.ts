import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoEngineError } from '../../src/errors.js'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver | undefined
let resolveError: Error | undefined

vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return {
    ...actual,
    resolveEngine: async () => {
      if (resolveError) throw resolveError
      return { driver, detect: { available: true }, platform: { supported: true } }
    },
  }
})
vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  return { ...actual, detectHost: async () => ({ os: 'linux', arch: 'x64' }) }
})

const { default: Rm } = await import('../../src/commands/rm.js')
const { default: Stop } = await import('../../src/commands/stop.js')
const { loadManifest, saveManifest } = await import('../../src/state/store.js')
const { hostAlias } = await import('../../src/core/ssh/ssh-config.js')

let state: Awaited<ReturnType<typeof useTempState>>
let prevHome: string | undefined

const started = (name = 'env1') =>
  manifest({
    name,
    engine: 'docker',
    container: { id: `cid-${name}`, name: `dcw-${name}`, status: 'running' } as never,
  })

const present = [{ id: 'cid-env1', name: 'dcw-env1', image: 'img', status: 'Up 2m', labels: {} }]

beforeEach(async () => {
  state = await useTempState('dcw-rmstop-')
  prevHome = process.env.HOME
  process.env.HOME = path.join(state.dir, 'home')
  await fs.mkdir(path.join(process.env.HOME, '.ssh'), { recursive: true })
  driver = new FakeDriver({ name: 'docker' })
  resolveError = undefined
})

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HOME
  else process.env.HOME = prevHome
  await state.cleanup()
  vi.clearAllMocks()
})

describe('dcw rm', () => {
  it('refuses to purge without confirmation', async () => {
    await saveManifest(started())
    await expect(runCommand(Rm, { args: { name: 'env1' }, flags: { purge: true }, json: true })).rejects.toMatchObject({
      code: 'E_CONFIRM',
      exitCode: 2,
    })
    expect(await loadManifest('env1')).not.toBeNull()
  })

  it('removes the container by label presence and clears it from the manifest', async () => {
    await saveManifest(started())
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)

    const { result, logs } = await runCommand<{ removedContainer: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: { purge: false },
      json: false,
    })

    expect(result?.removedContainer).toBe(true)
    expect(driver!.rms).toEqual([{ id: 'cid-env1', force: true }])
    expect(logs).toEqual(["Removed container for 'env1'. Run `dcw up env1` to restart."])
    expect((await loadManifest('env1'))?.container).toBeNull()
  })

  it('falls back to the derived container name when no id was recorded', async () => {
    await saveManifest(manifest({ name: 'env1', engine: 'docker', container: { name: 'dcw-env1' } as never }))
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)
    await runCommand(Rm, { args: { name: 'env1' }, flags: {}, json: true })
    expect(driver!.rms).toEqual([{ id: 'dcw-env1', force: true }])
  })

  it('reports a benign no-op when the container is already gone', async () => {
    await saveManifest(started())
    const { result, logs } = await runCommand<{ removedContainer: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })
    expect(result?.removedContainer).toBe(false)
    expect(logs).toEqual(["No container to remove for 'env1'."])
  })

  it('purges the record, the state dir and the managed ssh config block', async () => {
    await saveManifest(started())
    const sshConfig = path.join(os.homedir(), '.ssh', 'config')
    await fs.writeFile(sshConfig, `Host other\n\n# >>> dcw env1 >>>\nHost ${hostAlias('env1')}\n# <<< dcw env1 <<<\n`)

    const { result, logs } = await runCommand<{ purged: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: { purge: true, yes: true },
      json: false,
    })

    expect(result?.purged).toBe(true)
    expect(await loadManifest('env1')).toBeNull()
    expect(await fs.readFile(sshConfig, 'utf8')).not.toContain('dcw-env1')
    expect(logs).toEqual(["Purged environment 'env1'."])
  })

  it('purges even when the ssh config cannot be rewritten', async () => {
    await saveManifest(started())
    // No ~/.ssh at all: removeSshConfig must not take the purge down with it.
    await fs.rm(path.join(os.homedir(), '.ssh'), { recursive: true, force: true })
    const { result } = await runCommand<{ purged: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: { purge: true, yes: true },
      json: true,
    })
    expect(result?.purged).toBe(true)
  })

  it('purges local state when the engine is gone, instead of stranding the environment', async () => {
    await saveManifest(started())
    resolveError = new NoEngineError('No supported container engine is available.')

    const { result, warns } = await runCommand<{ purged: boolean; removedContainer: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: { purge: true, yes: true },
      json: false,
    })

    expect(result).toMatchObject({ purged: true, removedContainer: false })
    expect(warns[0]).toContain('Purging local state anyway')
    expect(await loadManifest('env1')).toBeNull()
  })

  it('still refuses a non-purge rm when the engine is unavailable', async () => {
    await saveManifest(started())
    resolveError = new NoEngineError('No supported container engine is available.')
    await expect(runCommand(Rm, { args: { name: 'env1' }, flags: {}, json: true })).rejects.toMatchObject({
      code: 'E_NO_ENGINE',
    })
  })

  it('reports a non-Error engine failure without crashing on it', async () => {
    await saveManifest(started())
    resolveError = 'daemon exploded' as unknown as Error
    const { warns } = await runCommand(Rm, { args: { name: 'env1' }, flags: { purge: true, yes: true }, json: false })
    expect(warns[0]).toContain('daemon exploded')
  })

  it('purges a record that no longer validates, and warns about it', async () => {
    const { manifestPath } = await import('../../src/state/paths.js')
    await fs.mkdir(path.dirname(manifestPath('env1')), { recursive: true })
    await fs.writeFile(manifestPath('env1'), JSON.stringify({ schemaVersion: 1, name: 'env1', nope: true }))
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)

    const { result, warns } = await runCommand<{ purged: boolean; removedContainer: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: { purge: true, yes: true },
      json: false,
    })

    // Without the fallback the record is stuck: hidden from `ls`, unremovable.
    expect(result).toMatchObject({ purged: true, removedContainer: true })
    expect(warns[0]).toContain('Purging the invalid record anyway.')
    await expect(fs.access(manifestPath('env1'))).rejects.toThrow()
  })

  it('skips container removal for an environment that never had one', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const psSpy = vi.spyOn(driver!, 'ps')
    const { result } = await runCommand<{ removedContainer: boolean }>(Rm, {
      args: { name: 'env1' },
      flags: {},
      json: true,
    })
    expect(result?.removedContainer).toBe(false)
    expect(psSpy).not.toHaveBeenCalled()
  })

  it('stays silent on stdout under --json', async () => {
    await saveManifest(started())
    const { logs } = await runCommand(Rm, { args: { name: 'env1' }, flags: { purge: true, yes: true }, json: true })
    expect(logs).toEqual([])
  })
})

describe('dcw stop', () => {
  it('stops a running container and records the stopped status', async () => {
    await saveManifest(started())
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)

    const { result, logs } = await runCommand<{ stopped: boolean }>(Stop, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })

    expect(result?.stopped).toBe(true)
    expect(driver!.stops).toEqual(['cid-env1'])
    expect(logs).toEqual(['Stopped cid-env1.'])
    expect((await loadManifest('env1'))?.container?.status).toBe('stopped')
  })

  it('falls back to the derived container name when no id was recorded', async () => {
    await saveManifest(manifest({ name: 'env1', engine: 'docker', container: { name: 'dcw-env1' } as never }))
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)
    await runCommand(Stop, { args: { name: 'env1' }, flags: {}, json: true })
    expect(driver!.stops).toEqual(['dcw-env1'])
  })

  it('is a benign no-op when no container was ever recorded', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const { result, logs } = await runCommand<{ stopped: boolean }>(Stop, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })
    expect(result?.stopped).toBe(false)
    expect(logs).toEqual(["Nothing to stop for 'env1'."])
  })

  it('is a benign no-op when the recorded container is already gone', async () => {
    await saveManifest(started())
    const { result, logs } = await runCommand<{ stopped: boolean }>(Stop, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })
    expect(result?.stopped).toBe(false)
    expect(logs).toEqual(["Nothing to stop for 'env1' (no container)."])
    expect(driver!.stops).toEqual([])
  })

  it('stays silent on stdout under --json', async () => {
    await saveManifest(started())
    vi.spyOn(driver!, 'ps').mockResolvedValue(present)
    const { logs } = await runCommand(Stop, { args: { name: 'env1' }, flags: {}, json: true })
    expect(logs).toEqual([])
  })
})
