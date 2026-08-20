import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDriver } from '../engine/fake-driver.js'
import { manifest, useTempState } from '../helpers/fixtures.js'

let driver: FakeDriver
const resolveEngine = vi.fn(async (_opts: unknown) => ({ driver, detect: { available: true }, platform: { supported: true } }))
const detectHost = vi.fn(async () => ({ os: 'linux' as const, arch: 'x64' as const }))

vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return { ...actual, resolveEngine: (opts: unknown) => resolveEngine(opts) }
})
vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  return { ...actual, detectHost: () => detectHost() }
})

const { assertStrictContainer, execInto, nowIso, requireManifest, resolveEngineFor, resolveEnvName } = await import(
  '../../src/cli/context.js'
)
const { saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>
let cwd: string

beforeEach(async () => {
  state = await useTempState('dcw-ctx-')
  cwd = path.join(state.dir, 'work')
  await fs.mkdir(cwd, { recursive: true })
  vi.spyOn(process, 'cwd').mockReturnValue(cwd)
  driver = new FakeDriver({ name: 'docker' })
  resolveEngine.mockClear()
  detectHost.mockClear()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await state.cleanup()
})

describe('resolveEnvName', () => {
  it('uses an explicit positional name', async () => {
    expect(await resolveEnvName('my-env')).toBe('my-env')
  })

  it('rejects a name that is not a safe slug, before it reaches the filesystem', async () => {
    // Unchecked, '../…' is spliced verbatim into manifest and state paths.
    await expect(resolveEnvName('../../etc/passwd')).rejects.toMatchObject({ code: 'E_VALIDATION' })
    await expect(resolveEnvName('Has Spaces')).rejects.toMatchObject({ code: 'E_VALIDATION' })
  })

  it('falls back to the .dcw marker in the working directory', async () => {
    await fs.writeFile(path.join(cwd, '.dcw'), '  pinned\n')
    expect(await resolveEnvName()).toBe('pinned')
  })

  it('validates the .dcw marker too, and surfaces the error rather than falling through', async () => {
    await fs.writeFile(path.join(cwd, '.dcw'), '../escape')
    await saveManifest(manifest({ name: 'only' }))
    await expect(resolveEnvName()).rejects.toMatchObject({ code: 'E_VALIDATION' })
  })

  it('ignores an empty .dcw marker and continues resolving', async () => {
    await fs.writeFile(path.join(cwd, '.dcw'), '   \n')
    await saveManifest(manifest({ name: 'only' }))
    expect(await resolveEnvName()).toBe('only')
  })

  it('resolves the sole environment when there is exactly one', async () => {
    await saveManifest(manifest({ name: 'only' }))
    expect(await resolveEnvName()).toBe('only')
  })

  it('reports E_NOT_FOUND with a create hint when there are no environments', async () => {
    await expect(resolveEnvName()).rejects.toMatchObject({ code: 'E_NOT_FOUND', message: expect.stringContaining('dcw create') })
  })

  it('lists the candidates when the choice is ambiguous', async () => {
    await saveManifest(manifest({ name: 'alpha' }))
    await saveManifest(manifest({ name: 'beta' }))
    await expect(resolveEnvName()).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
      message: expect.stringContaining('alpha, beta'),
    })
  })
})

describe('requireManifest', () => {
  it('returns the stored manifest', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    expect((await requireManifest('env1')).name).toBe('env1')
  })

  it('raises E_NOT_FOUND for an environment that does not exist', async () => {
    await expect(requireManifest('nope')).rejects.toMatchObject({ code: 'E_NOT_FOUND' })
  })
})

describe('resolveEngineFor', () => {
  it('prefers the --engine flag over the manifest preference', async () => {
    await resolveEngineFor({ requested: 'podman', manifestEngine: 'docker' })
    expect(resolveEngine).toHaveBeenCalledWith({ requested: 'podman', host: { os: 'linux', arch: 'x64' } })
  })

  it("falls back to the manifest's saved engine", async () => {
    await resolveEngineFor({ requested: undefined, manifestEngine: 'lima' })
    expect(resolveEngine.mock.calls[0]?.[0]).toMatchObject({ requested: 'lima' })
  })

  it("treats 'auto' on either side as 'no preference'", async () => {
    await resolveEngineFor({ requested: 'auto', manifestEngine: 'auto' })
    expect(resolveEngine.mock.calls[0]?.[0]).toMatchObject({ requested: undefined })
  })

  it('ignores a null manifest engine', async () => {
    await resolveEngineFor({ manifestEngine: null })
    expect(resolveEngine.mock.calls[0]?.[0]).toMatchObject({ requested: undefined })
  })

  it('returns the driver alongside its name, capabilities, host and detect result', async () => {
    const ctx = await resolveEngineFor({})
    expect(ctx.engineName).toBe('docker')
    expect(ctx.capabilities).toBe(driver.capabilities)
    expect(ctx.host).toEqual({ os: 'linux', arch: 'x64' })
    expect(ctx.detect).toEqual({ available: true })
  })
})

describe('nowIso', () => {
  it('formats the current instant as an ISO-8601 timestamp', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('assertStrictContainer', () => {
  const running = (over: Record<string, unknown>) =>
    manifest({ name: 'env1', container: { name: 'dcw-env1', ...over } as never })

  it('does nothing when --strict is off', () => {
    expect(() => assertStrictContainer(running({ droppedHardening: ['apparmor'] }), false)).not.toThrow()
    expect(() => assertStrictContainer(running({ droppedHardening: ['apparmor'] }), undefined)).not.toThrow()
  })

  it('passes a container whose hardening was fully honored', () => {
    expect(() => assertStrictContainer(running({ droppedHardening: [], unenforcedHardening: [] }), true)).not.toThrow()
    expect(() => assertStrictContainer(manifest({ name: 'env1' }), true)).not.toThrow()
  })

  it('refuses to enter a container with dropped hardening', () => {
    expect(() => assertStrictContainer(running({ droppedHardening: ['network-none'] }), true)).toThrow(
      /network-none/,
    )
  })

  it('refuses a container whose hardening was emitted but is unenforced', () => {
    // A flag that is present but inert is exactly the silent failure --strict exists for.
    expect(() => assertStrictContainer(running({ unenforcedHardening: ['apparmor'] }), true)).toThrow(/apparmor/)
  })
})

describe('execInto', () => {
  const withContainer = (over: Record<string, unknown> = {}) =>
    manifest({
      name: 'env1',
      engine: 'docker',
      container: { id: 'cid-1', name: 'dcw-env1', status: 'running', ...over } as never,
    })

  it('execs the given command into the recorded container id', async () => {
    await saveManifest(withContainer())
    const code = await execInto({ name: 'env1', cmd: ['forge', '--version'] })
    expect(code).toBe(0)
    expect(driver.execs[0]).toMatchObject({ container: 'cid-1', cmd: ['forge', '--version'] })
  })

  it('falls back to the container name when no id was recorded', async () => {
    await saveManifest(withContainer({ id: undefined }))
    await execInto({ name: 'env1', cmd: ['ls'] })
    expect(driver.execs[0]?.container).toBe('dcw-env1')
  })

  it('defaults to an interactive zsh when no command is given', async () => {
    await saveManifest(withContainer())
    await execInto({ name: 'env1', cmd: [] })
    expect(driver.execs[0]?.cmd).toEqual(['zsh'])
  })

  it('forwards the requested environment variables', async () => {
    await saveManifest(withContainer())
    await execInto({ name: 'env1', cmd: ['env'], env: { GITHUB_TOKEN: 'ghp_x' } })
    expect(driver.execs[0]?.env).toEqual({ GITHUB_TOKEN: 'ghp_x' })
  })

  it('allocates a TTY only when both stdin and stdout are terminals', async () => {
    await saveManifest(withContainer())
    const stdin = process.stdin as unknown as { isTTY: boolean | undefined }
    const stdout = process.stdout as unknown as { isTTY: boolean | undefined }
    const prev = [stdin.isTTY, stdout.isTTY] as const

    try {
      stdin.isTTY = true
      stdout.isTTY = true
      await execInto({ name: 'env1', cmd: ['ls'] })
      expect(driver.execs.at(-1)).toMatchObject({ interactive: true, tty: true })

      // Piped/CI/agent invocation: no TTY, so `dcw exec env -- cmd` still works.
      stdout.isTTY = false
      await execInto({ name: 'env1', cmd: ['ls'] })
      expect(driver.execs.at(-1)).toMatchObject({ interactive: false, tty: false })
    } finally {
      stdin.isTTY = prev[0]
      stdout.isTTY = prev[1]
    }
  })

  it('raises E_NOT_FOUND with an `up` hint when the environment has no container', async () => {
    await saveManifest(manifest({ name: 'env1' }))
    await expect(execInto({ name: 'env1', cmd: ['ls'] })).rejects.toMatchObject({
      code: 'E_NOT_FOUND',
      message: expect.stringContaining('dcw up env1'),
    })
  })

  it('refuses under --strict when the running container lost hardening', async () => {
    await saveManifest(withContainer({ droppedHardening: ['network-none'] }))
    await expect(execInto({ name: 'env1', cmd: ['ls'], strict: true })).rejects.toMatchObject({
      code: 'E_STRICT_HARDENING',
    })
    expect(driver.execs).toEqual([])
  })

  it("falls back to the spec's engine when the manifest has no resolved engine", async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        engine: null,
        spec: { name: 'env1', engine: 'lima', selections: {}, hardening: [], ssh: true },
        container: { id: 'cid-1', name: 'dcw-env1' } as never,
      }),
    )
    await execInto({ name: 'env1', cmd: ['ls'] })
    expect(resolveEngine.mock.calls[0]?.[0]).toMatchObject({ requested: 'lima' })
  })

  it("resolves the engine from the manifest, preferring its resolved engine over the spec's", async () => {
    await saveManifest(
      manifest({
        name: 'env1',
        engine: 'podman',
        spec: { name: 'env1', engine: 'lima', selections: {}, hardening: [], ssh: true },
        container: { id: 'cid-1', name: 'dcw-env1' } as never,
      }),
    )
    await execInto({ name: 'env1', cmd: ['ls'] })
    expect(resolveEngine.mock.calls[0]?.[0]).toMatchObject({ requested: 'podman' })
  })
})
