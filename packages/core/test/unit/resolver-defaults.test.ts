import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CaptureResult } from '../../src/engine/exec.js'
import { ALL_ENGINES } from '../../src/engine/types.js'

// Nothing is installed: every version/info probe spawn-fails, so the real driver
// registry can be exercised without touching the developer's actual engines.
vi.mock('../../src/engine/exec.js', () => ({
  capture: async (): Promise<CaptureResult> => ({
    code: 127,
    stdout: '',
    stderr: 'not found',
    spawnError: true,
  }),
  inherit: async () => 127,
}))

const { resolveEngine, surveyEngines } = await import('../../src/engine/resolver.js')

const macIntel = { os: 'macos' as const, arch: 'x64' as const, macosMajor: 15 }

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolver defaults to the real driver registry', () => {
  it('surveys every registered engine when no drivers are injected', async () => {
    const statuses = await surveyEngines({ host: macIntel })
    expect(statuses.map((s) => s.name).sort()).toEqual([...ALL_ENGINES].sort())
    // Apple Containers needs Apple Silicon, so it is unsupported on an Intel Mac
    // and is never probed.
    const apple = statuses.find((s) => s.name === 'apple-container')!
    expect(apple.platform.supported).toBe(false)
    expect(apple.detect).toBeUndefined()
    expect(statuses.every((s) => !s.recommended)).toBe(true)
  })

  it('reports no engine available when none is installed', async () => {
    await expect(resolveEngine({ host: macIntel })).rejects.toMatchObject({ code: 'E_NO_ENGINE' })
  })

  it('skips a platform-unsupported engine while auto-detecting', async () => {
    // apple-container sits in the macOS preference order but cannot run on x64,
    // so it must not appear among the engines that were actually tried.
    const err = await resolveEngine({ host: macIntel }).catch((e: Error) => e)
    const tried = /Tried: (.*?)\. Install/.exec((err as Error).message)?.[1] ?? ''
    expect(tried).not.toContain('Apple Containers')
    expect(tried).toContain('Docker')
  })

  it('reports a requested-but-missing engine with the reason the driver gave', async () => {
    await expect(resolveEngine({ requested: 'docker', host: macIntel })).rejects.toMatchObject({
      code: 'E_ENGINE_UNAVAILABLE',
      message: expect.stringContaining('docker not found on PATH.'),
    })
  })
})
