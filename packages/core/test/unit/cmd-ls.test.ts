import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContainerInfo } from '../../src/engine/types.js'
import { NoEngineError } from '../../src/errors.js'
import { manifest, useTempState } from '../helpers/fixtures.js'
import { runCommand } from '../helpers/command.js'

/** Per-engine ps() results; an entry that throws models an unreachable engine. */
const psByEngine = new Map<string | undefined, ContainerInfo[] | Error>()
const seenRequests: Array<{ requested?: string; manifestEngine?: string }> = []

vi.mock('../../src/cli/context.js', async (orig) => {
  const actual = await orig<typeof import('../../src/cli/context.js')>()
  return {
    ...actual,
    resolveEngineFor: vi.fn(async (opts: { requested?: string; manifestEngine?: string }) => {
      seenRequests.push(opts)
      const key = opts.requested ?? opts.manifestEngine
      const entry = psByEngine.get(key)
      if (entry instanceof Error) throw entry
      return {
        driver: { name: key ?? 'docker', ps: async () => entry ?? [] },
      }
    }),
  }
})

const { default: Ls } = await import('../../src/commands/ls.js')
const { saveManifest } = await import('../../src/state/store.js')

let state: Awaited<ReturnType<typeof useTempState>>

beforeEach(async () => {
  state = await useTempState('dcw-ls-')
  psByEngine.clear()
  seenRequests.length = 0
})

afterEach(async () => {
  await state.cleanup()
  vi.clearAllMocks()
})

function container(name: string, status: string): ContainerInfo {
  return { id: 'cid', name, image: 'img', status, labels: {} }
}

const startedContainer = { id: 'cid', name: 'dcw-x', status: 'running' as const, startedAt: '2026-06-11T00:00:00.000Z' }

describe('dcw ls', () => {
  it('returns an empty list and a hint when no environments exist', async () => {
    const { result, logs } = await runCommand<{ environments: unknown[] }>(Ls, { flags: {} })
    expect(result?.environments).toEqual([])
    expect(logs.join('\n')).toContain('No environments yet')
  })

  it('reconciles each environment against ITS OWN engine, not one auto-detected engine', async () => {
    await saveManifest(manifest({ name: 'a', engine: 'docker', container: { ...startedContainer, name: 'dcw-a' } }))
    await saveManifest(manifest({ name: 'b', engine: 'podman', container: { ...startedContainer, name: 'dcw-b' } }))
    // Each container is only visible to its own engine.
    psByEngine.set('docker', [container('dcw-a', 'Up 3 minutes')])
    psByEngine.set('podman', [container('dcw-b', 'Exited (0) 1 hour ago')])

    const { result } = await runCommand<{ environments: Array<{ name: string; status: string }> }>(Ls, { flags: {} })

    expect(result?.environments).toEqual([
      expect.objectContaining({ name: 'a', status: 'running' }),
      expect.objectContaining({ name: 'b', status: 'stopped' }),
    ])
    expect(seenRequests.map((r) => r.manifestEngine).sort()).toEqual(['docker', 'podman'])
  })

  it("reports 'unknown' when the environment's engine cannot be reached", async () => {
    await saveManifest(manifest({ name: 'ghost', engine: 'docker', container: { ...startedContainer, name: 'dcw-ghost' } }))
    psByEngine.set('docker', new NoEngineError('no engine'))

    const { result } = await runCommand<{ environments: Array<{ status: string }> }>(Ls, { flags: {} })
    // 'absent' would assert the container is gone; we simply cannot tell.
    expect(result?.environments[0]?.status).toBe('unknown')
  })

  it("reports 'absent' when a reachable engine no longer has the container", async () => {
    await saveManifest(manifest({ name: 'gone', engine: 'docker', container: { ...startedContainer, name: 'dcw-gone' } }))
    psByEngine.set('docker', [])

    const { result } = await runCommand<{ environments: Array<{ status: string }> }>(Ls, { flags: {} })
    expect(result?.environments[0]?.status).toBe('absent')
  })

  it("reports 'never-started' for an environment that has no container record", async () => {
    await saveManifest(manifest({ name: 'fresh' }))
    const { result } = await runCommand<{ environments: Array<{ status: string }> }>(Ls, { flags: {} })
    expect(result?.environments[0]?.status).toBe('never-started')
  })

  it('probes only the requested engine when --engine is given', async () => {
    await saveManifest(manifest({ name: 'a', engine: 'docker', container: { ...startedContainer, name: 'dcw-a' } }))
    await saveManifest(manifest({ name: 'b', engine: 'podman', container: { ...startedContainer, name: 'dcw-b' } }))
    psByEngine.set('lima', [container('dcw-a', 'Up 1 second')])

    const { result } = await runCommand<{ environments: Array<{ name: string; status: string }> }>(Ls, {
      flags: { engine: 'lima' },
    })

    expect(seenRequests).toEqual([{ requested: 'lima', manifestEngine: 'lima' }])
    expect(result?.environments).toEqual([
      expect.objectContaining({ name: 'a', status: 'running' }),
      // 'b' lives on podman, but --engine pins the lookup to lima, where it is absent.
      expect.objectContaining({ name: 'b', status: 'absent' }),
    ])
  })

  it('summarizes build state, tool count and hardening count', async () => {
    await saveManifest(
      manifest({
        name: 'rich',
        engine: 'docker',
        image: { tag: 'dcw/rich:latest', containerfileHash: 'h', imageId: 'sha256:1' },
        resolved: { requiredTools: ['rust', 'foundry'], hardeningKeys: ['drop-caps', 'read-only-root'] },
      }),
    )
    psByEngine.set('docker', [])

    const { result } = await runCommand<{ environments: Array<Record<string, unknown>> }>(Ls, { flags: {} })
    expect(result?.environments[0]).toMatchObject({ built: true, tools: 2, hardening: 2, engine: 'docker' })
  })

  it("groups environments with no engine preference at all under the auto target", async () => {
    await saveManifest(manifest({ name: 'undecided' }))
    psByEngine.set('auto', [])
    const { result } = await runCommand<{ environments: Array<{ engine: string | null }> }>(Ls, { flags: {} })
    expect(seenRequests).toEqual([{ requested: undefined, manifestEngine: 'auto' }])
    expect(result?.environments[0]?.engine).toBeNull()
  })

  it('renders an aligned human table when --json is absent', async () => {
    await saveManifest(manifest({ name: 'alpha', engine: 'docker' }))
    psByEngine.set('docker', [])

    const { logs } = await runCommand(Ls, { flags: {}, json: false })
    expect(logs[0]).toBe('NAME                 ENGINE           BUILT  STATUS')
    expect(logs[1]).toBe('alpha                docker           no     never-started')
  })

  it('prints nothing but the payload under --json', async () => {
    await saveManifest(manifest({ name: 'alpha', engine: 'docker' }))
    psByEngine.set('docker', [])
    const { logs } = await runCommand(Ls, { flags: {}, json: true })
    expect(logs).toEqual([])
  })

  it('falls back to the spec engine when the manifest has no resolved engine yet', async () => {
    await saveManifest(manifest({ name: 'specced', spec: { name: 'specced', engine: 'podman', selections: {}, hardening: [], ssh: true } }))
    psByEngine.set('podman', [])
    const { result } = await runCommand<{ environments: Array<{ engine: string | null }> }>(Ls, { flags: {} })
    expect(seenRequests[0]?.manifestEngine).toBe('podman')
    // `engine` in the row is the RESOLVED engine, still null until a build/up runs.
    expect(result?.environments[0]?.engine).toBeNull()
  })
})
