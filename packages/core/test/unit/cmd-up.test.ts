import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return {
    ...actual,
    resolveEngineFor: vi.fn(async () => ({
      driver,
      engineName: driver.name,
      capabilities: driver.capabilities,
    })),
  }
})

const { default: Up } = await import('../../src/commands/up.js')
const { saveManifest, loadManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

beforeEach(async () => {
  state = await useTempState('dcw-up-')
  driver = new FakeDriver({ name: 'docker', displayName: 'Docker' })
})

afterEach(async () => {
  await state.cleanup()
  vi.clearAllMocks()
})

const hardened = (keys: string[]) =>
  manifest({ name: 'env1', spec: { name: 'env1', engine: 'auto', selections: {}, hardening: keys, ssh: true } })

describe('dcw up', () => {
  it('builds then starts the container and returns the full envelope', async () => {
    await saveManifest(manifest({ name: 'env1' }))

    const { result } = await runCommand<Record<string, any>>(Up, {
      args: { name: 'env1' },
      flags: { workspace: '/host/ws' },
      json: true,
    })

    expect(driver.builds).toHaveLength(1)
    expect(driver.runs).toHaveLength(1)
    expect(result).toMatchObject({ name: 'env1', engine: 'docker', containerId: 'cid-dcw-env1', failedTools: [] })
    expect(result?.appliedFlags).toContain('/host/ws:/workspace')
    expect(result?.hardening).toEqual({ appliedFlags: result?.appliedFlags, warnings: [], dropped: [], unenforced: [] })
    const saved = await loadManifest('env1')
    expect(saved?.container).toMatchObject({ id: 'cid-dcw-env1', name: 'dcw-env1', status: 'running' })
  })

  it('mounts the current directory when --workspace is omitted', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const { result } = await runCommand<{ appliedFlags: string[] }>(Up, { args: { name: 'env1' }, flags: {}, json: true })
    expect(result?.appliedFlags).toContain(`${process.cwd()}:/workspace`)
  })

  it('removes any stale container of the same name before starting a fresh one', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: true })
    expect(driver.rms).toEqual([{ id: 'dcw-env1', force: true }])
  })

  it('ignores a failure from that best-effort cleanup rm', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    vi.spyOn(driver, 'rm').mockRejectedValue(new Error('no such container'))
    const { result } = await runCommand<{ containerId: string }>(Up, { args: { name: 'env1' }, flags: {}, json: true })
    expect(result?.containerId).toBe('cid-dcw-env1')
  })

  it('persists image state even when the run step then fails', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    vi.spyOn(driver, 'run').mockRejectedValue(new Error('port already allocated'))

    await expect(runCommand(Up, { args: { name: 'env1' }, flags: {}, json: true })).rejects.toThrow(
      'port already allocated',
    )

    // Without the mid-flight save, the next `up` would rebuild from scratch.
    const saved = await loadManifest('env1')
    expect(saved?.image?.imageId).toBe('sha256:fake-dcw/env1:latest')
  })

  it('rejects --strict BEFORE building when the engine cannot honor the hardening', async () => {
    await saveManifest(hardened(['apparmor']))
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM in this VM' } }),
    })

    await expect(
      runCommand(Up, { args: { name: 'env1' }, flags: { strict: true }, json: true }),
    ).rejects.toMatchObject({ code: 'E_STRICT_HARDENING' })

    // The point of the early check: a strict run that cannot succeed must not
    // spend minutes building an image first.
    expect(driver.builds).toEqual([])
  })

  it('rejects --strict for hardening that is emitted but unenforced', async () => {
    await saveManifest(hardened(['apparmor']))
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ apparmor: { support: 'caveated', enforced: false, note: 'accepted but inert' } }),
    })
    await expect(
      runCommand(Up, { args: { name: 'env1' }, flags: { strict: true }, json: true }),
    ).rejects.toMatchObject({ code: 'E_STRICT_HARDENING' })
  })

  it('reports dropped hardening in the JSON envelope instead of failing without --strict', async () => {
    await saveManifest(hardened(['apparmor']))
    driver = new FakeDriver({
      name: 'docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM in this VM' } }),
    })

    const { result } = await runCommand<Record<string, any>>(Up, { args: { name: 'env1' }, flags: {}, json: true })

    expect(result?.dropped).toEqual(['apparmor'])
    expect(result?.warnings).toEqual([{ level: 'dropped', effect: 'apparmor', message: 'no LSM in this VM' }])
    expect(result?.hardening.dropped).toEqual(['apparmor'])
    const saved = await loadManifest('env1')
    expect(saved?.container?.droppedHardening).toEqual(['apparmor'])
  })

  it('forces a rebuild with --rebuild', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: true })
    driver.builds.length = 0
    await runCommand(Up, { args: { name: 'env1' }, flags: { rebuild: true }, json: true })
    expect(driver.builds).toHaveLength(1)
    expect(driver.builds[0]?.noCache).toBe(true)
  })

  it('logs the build, the start line and the shell hint in human mode', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const { logs, warns } = await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: false })
    expect(logs[0]).toBe('Built dcw/env1:latest.')
    expect(logs[1]).toBe('Started dcw-env1 on Docker (cid-dcw-env1).')
    expect(logs[2]).toBe('\nShell in with:  dcw shell env1')
    expect(warns).toEqual([])
  })

  it('skips the build line on a second, up-to-date run', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: false })
    const { logs } = await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: false })
    expect(logs.some((l) => l.startsWith('Built '))).toBe(false)
    expect(logs[0]).toBe('Started dcw-env1 on Docker (cid-dcw-env1).')
  })

  it('warns in human mode about failed tools and about dropped hardening', async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        spec: { name: 'env1', engine: 'auto', selections: { frameworks: ['foundry'] }, hardening: ['apparmor'], ssh: true },
      }),
    )
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'unsupported', note: 'no LSM in this VM' } }),
      runOnceResult: { stdout: 'foundry=fail\n', code: 0 },
    })

    const { warns } = await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: false })
    expect(warns).toEqual(['tools failed to install: foundry', 'dropped [apparmor]: no LSM in this VM'])
  })

  it('warns that tool installs are unverified when the report is unreadable', async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        spec: { name: 'env1', engine: 'auto', selections: { frameworks: ['foundry'] }, hardening: [], ssh: true },
      }),
    )
    driver = new FakeDriver({ name: 'docker', displayName: 'Docker', runOnceResult: { stdout: '', code: 1 } })
    const { result, warns } = await runCommand<{ toolsVerified: boolean }>(Up, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })
    expect(result?.toolsVerified).toBe(false)
    expect(warns).toContain('could not read the in-image tool report; install status is unverified.')
  })

  it('prints caveat warnings with a "note" prefix rather than "dropped"', async () => {
    await saveManifest(hardened(['apparmor']))
    driver = new FakeDriver({
      name: 'docker',
      displayName: 'Docker',
      capabilities: caps({ apparmor: { support: 'caveated', note: 'best effort only' } }),
    })
    const { warns } = await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: false })
    expect(warns).toEqual(['note [apparmor]: best effort only'])
  })

  it('stays silent on stdout under --json', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const { logs, warns } = await runCommand(Up, { args: { name: 'env1' }, flags: {}, json: true })
    expect(logs).toEqual([])
    expect(warns).toEqual([])
  })
})
