import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

let driver: FakeDriver
const resolveCalls: Array<{ requested?: string; manifestEngine?: string }> = []

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return {
    ...actual,
    resolveEngineFor: vi.fn(async (opts: { requested?: string; manifestEngine?: string }) => {
      resolveCalls.push(opts)
      return { driver, engineName: driver.name, capabilities: driver.capabilities }
    }),
  }
})

const { default: Build } = await import('../../src/commands/build.js')
const { saveManifest, loadManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

beforeEach(async () => {
  state = await useTempState('dcw-build-')
  driver = new FakeDriver({ name: 'docker', displayName: 'Docker' })
  resolveCalls.length = 0
})

afterEach(async () => {
  await state.cleanup()
  vi.clearAllMocks()
})

/** An env whose plan installs a leaf tool, so the in-image report probe runs. */
const withTool = () =>
  manifest({ name: 'env1', spec: { name: 'env1', engine: 'auto', selections: { frameworks: ['foundry'] }, hardening: [], ssh: true } })

describe('dcw build', () => {
  it('builds the image, persists the manifest, and reports the outcome', async () => {
    await saveManifest(manifest({ name: 'env1' }))

    const { result } = await runCommand<Record<string, unknown>>(Build, { args: { name: 'env1' }, flags: { force: false }, json: true })

    expect(result).toMatchObject({ name: 'env1', engine: 'docker', tag: 'dcw/env1:latest', skipped: false, failedTools: [] })
    expect(driver.builds).toHaveLength(1)
    expect(driver.builds[0]).toMatchObject({ tag: 'dcw/env1:latest', noCache: false })
    // Image state must survive the command, or the next build starts from scratch.
    const saved = await loadManifest('env1')
    expect(saved?.image?.tag).toBe('dcw/env1:latest')
    expect(saved?.engine).toBe('docker')
  })

  it('honors --platform and --force', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await runCommand(Build, { args: { name: 'env1' }, flags: { force: true, platform: 'linux/amd64' }, json: true })
    expect(driver.builds[0]).toMatchObject({ platform: 'linux/amd64', noCache: true })
  })

  it('passes the flag engine ahead of the spec engine to the resolver', async () => {
    await saveManifest(manifest({ name: 'env1', spec: { name: 'env1', engine: 'podman', selections: {}, hardening: [], ssh: true } }))
    await runCommand(Build, { args: { name: 'env1' }, flags: { engine: 'lima' }, json: true })
    expect(resolveCalls[0]).toEqual({ requested: 'lima', manifestEngine: 'podman' })
  })

  it('skips a rebuild when the image is already up to date', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await runCommand(Build, { args: { name: 'env1' }, flags: {}, json: true })
    driver.builds.length = 0

    const { result, logs } = await runCommand<{ skipped: boolean; tag: string }>(Build, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })

    expect(result?.skipped).toBe(true)
    expect(driver.builds).toHaveLength(0)
    expect(logs.join('\n')).toContain('Image dcw/env1:latest is up to date (skipped).')
  })

  it('logs progress and the built image id in human mode', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    const { logs, warns } = await runCommand(Build, { args: { name: 'env1' }, flags: {}, json: false })
    expect(logs[0]).toBe("Building 'env1' with Docker…")
    // The id is truncated to 19 chars, matching the short-digest convention.
    expect(logs[1]).toBe('Built dcw/env1:latest (sha256:fake-dcw/env).')
    expect(warns).toEqual([])
  })

  it('warns about tools that failed to install', async () => {
    await saveManifest(withTool())
    driver = new FakeDriver({ name: 'docker', displayName: 'Docker', runOnceResult: { stdout: 'foundry=ok\nforge=fail\n', code: 0 } })

    const { result, warns } = await runCommand<{ failedTools: string[]; toolsVerified: boolean }>(Build, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })

    expect(result?.failedTools).toEqual(['forge'])
    expect(result?.toolsVerified).toBe(true)
    expect(warns).toEqual(['tools failed to install: forge'])
  })

  it('warns that install status is unverified when the in-image report is unreadable', async () => {
    await saveManifest(withTool())
    driver = new FakeDriver({ name: 'docker', displayName: 'Docker', runOnceResult: { stdout: '', code: 1 } })

    const { result, warns } = await runCommand<{ failedTools: string[]; toolsVerified: boolean }>(Build, {
      args: { name: 'env1' },
      flags: {},
      json: false,
    })

    // An empty failedTools list here means "verification did not run", not "all clean".
    expect(result?.failedTools).toEqual([])
    expect(result?.toolsVerified).toBe(false)
    expect(warns).toEqual(['could not read the in-image tool report; install status is unverified.'])
  })

  it('stays silent on stdout under --json even when tools fail', async () => {
    await saveManifest(withTool())
    driver = new FakeDriver({ name: 'docker', displayName: 'Docker', runOnceResult: { stdout: 'foundry=fail\n', code: 0 } })
    const { logs, warns } = await runCommand(Build, { args: { name: 'env1' }, flags: {}, json: true })
    expect(logs).toEqual([])
    expect(warns).toEqual([])
  })

  it('resolves the sole environment when no name is given', async () => {
    await saveManifest(manifest({ name: 'only' }))
    const { result } = await runCommand<{ name: string }>(Build, { args: {}, flags: {}, json: true })
    expect(result?.name).toBe('only')
  })

  it('fails with E_NOT_FOUND for an unknown environment', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await expect(runCommand(Build, { args: { name: 'nope' }, flags: {}, json: true })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
    })
  })
})
