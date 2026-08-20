import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DcwError } from '../../src/errors.js'
import type { ContainerInfo, EngineDriver } from '../../src/engine/types.js'

// A driver whose ps()/stop()/rm() we can script per test.
const driver = {
  name: 'docker',
  ps: vi.fn(async (): Promise<ContainerInfo[]> => []),
  stop: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
} as unknown as EngineDriver

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return { ...actual, resolveEngineFor: vi.fn(async () => ({ driver })) }
})

const { default: Stop } = await import('../../src/commands/stop.js')
const { default: Rm } = await import('../../src/commands/rm.js')
const { saveManifest, loadManifest } = await import('../../src/state/store.js')
const { SCHEMA_VERSION } = await import('../../src/state/manifest.js')

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-stoprm-'))
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
  process.env.XDG_STATE_HOME = path.join(tmp, 'state')
  ;(driver.ps as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue([])
  ;(driver.stop as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined)
  ;(driver.rm as ReturnType<typeof vi.fn>).mockReset().mockResolvedValue(undefined)
})

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME
  delete process.env.XDG_STATE_HOME
  await fs.rm(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function manifestWith(container: unknown) {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'env1',
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    spec: { name: 'env1', engine: 'auto', selections: {}, hardening: [], ssh: true },
    resolved: { requiredTools: [], hardeningKeys: [] },
    engine: null,
    image: null,
    container,
  }
}

const presentContainer: ContainerInfo = { id: 'c1', name: 'dcw-env1', image: 'img', status: 'Up 2m', labels: {} }

async function run<T>(Cmd: { prototype: { run(): Promise<T> } }, name: string, flags: Record<string, unknown> = {}): Promise<T> {
  const cmd = Object.create(Cmd.prototype)
  cmd.parse = async () => ({ args: { name }, flags })
  cmd.jsonEnabled = () => true
  cmd.log = () => {}
  return cmd.run()
}

describe('stop idempotency (#bug2)', () => {
  it('reports stopped:false when no container was ever recorded', async () => {
    await saveManifest(manifestWith(null) as never)
    const res = await run(Stop, 'env1')
    expect(res).toEqual({ name: 'env1', stopped: false })
    expect(driver.stop).not.toHaveBeenCalled()
  })

  it('reports stopped:false when the recorded container is already gone', async () => {
    await saveManifest(manifestWith({ id: 'c1', name: 'dcw-env1' }) as never)
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const res = await run(Stop, 'env1')
    expect(res).toEqual({ name: 'env1', stopped: false })
    expect(driver.stop).not.toHaveBeenCalled()
  })

  it('reports stopped:true and persists stopped status when it actually stops', async () => {
    await saveManifest(manifestWith({ id: 'c1', name: 'dcw-env1', status: 'running' }) as never)
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([presentContainer])
    const res = await run(Stop, 'env1')
    expect(res).toEqual({ name: 'env1', stopped: true })
    expect(driver.stop).toHaveBeenCalledOnce()
    const reloaded = await loadManifest('env1')
    expect(reloaded?.container?.status).toBe('stopped')
  })

  it('lets a genuine engine error surface instead of swallowing it', async () => {
    await saveManifest(manifestWith({ id: 'c1', name: 'dcw-env1' }) as never)
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([presentContainer])
    ;(driver.stop as ReturnType<typeof vi.fn>).mockRejectedValue(new DcwError('docker stop failed: boom'))
    await expect(run(Stop, 'env1')).rejects.toBeInstanceOf(DcwError)
  })
})

describe('rm idempotency (#bug2)', () => {
  it('reports removedContainer:false when there is no container to remove', async () => {
    await saveManifest(manifestWith(null) as never)
    const res = await run(Rm, 'env1')
    expect(res).toEqual({ name: 'env1', removedContainer: false, purged: false })
    expect(driver.rm).not.toHaveBeenCalled()
  })

  it('reports removedContainer:true when it actually removes', async () => {
    await saveManifest(manifestWith({ id: 'c1', name: 'dcw-env1' }) as never)
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([presentContainer])
    const res = await run(Rm, 'env1')
    expect(res).toEqual({ name: 'env1', removedContainer: true, purged: false })
    expect(driver.rm).toHaveBeenCalledOnce()
  })

  it('still purges the env record even with no container present', async () => {
    await saveManifest(manifestWith(null) as never)
    const res = await run(Rm, 'env1', { purge: true, yes: true })
    expect(res).toEqual({ name: 'env1', removedContainer: false, purged: true })
    expect(await loadManifest('env1')).toBeNull()
  })

  it('lets a genuine engine error surface instead of swallowing it', async () => {
    await saveManifest(manifestWith({ id: 'c1', name: 'dcw-env1' }) as never)
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([presentContainer])
    ;(driver.rm as ReturnType<typeof vi.fn>).mockRejectedValue(new DcwError('docker rm failed: boom'))
    await expect(run(Rm, 'env1')).rejects.toBeInstanceOf(DcwError)
  })
})

describe('rm --purge on an invalid manifest', () => {
  it('purges a record that no longer validates instead of leaving it stuck', async () => {
    const { manifestPath } = await import('../../src/state/paths.js')
    await fs.mkdir(path.dirname(manifestPath('env1')), { recursive: true })
    // Valid envelope, but spec fails the (tightened) schema: credential-bearing git url.
    const bad = manifestWith(null) as Record<string, unknown>
    ;(bad.spec as Record<string, unknown>).gitRepository = { url: 'https://u:tok@h/a/b', enabled: true }
    await fs.writeFile(manifestPath('env1'), JSON.stringify(bad))
    ;(driver.ps as ReturnType<typeof vi.fn>).mockResolvedValue([presentContainer])

    const cmd = Object.create(Rm.prototype)
    cmd.parse = async () => ({ args: { name: 'env1' }, flags: { purge: true, yes: true } })
    cmd.jsonEnabled = () => true
    cmd.log = () => {}
    cmd.warn = () => {}
    const res = await cmd.run()

    expect(res).toEqual({ name: 'env1', removedContainer: true, purged: true })
    expect(driver.rm).toHaveBeenCalledWith('dcw-env1', { force: true })
    await expect(fs.access(manifestPath('env1'))).rejects.toThrow()
  })

  it('still refuses to touch an invalid manifest without --purge', async () => {
    const { manifestPath } = await import('../../src/state/paths.js')
    await fs.mkdir(path.dirname(manifestPath('env1')), { recursive: true })
    await fs.writeFile(manifestPath('env1'), '{"schemaVersion":1,"nope":true}')
    await expect(run(Rm, 'env1')).rejects.toBeInstanceOf(DcwError)
  })
})
