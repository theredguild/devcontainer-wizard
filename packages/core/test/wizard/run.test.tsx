import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDriver } from '../../src/engine/registry.js'
import type { EngineStatus } from '../../src/engine/resolver.js'
import type { EnvSpec } from '../../src/spec/env-spec.js'

interface AppProps {
  initial: Record<string, unknown>
  engines: EngineStatus[]
  onComplete: (spec: EnvSpec) => void
  onCancel: () => void
}

let rendered: { element: ReactElement<AppProps>; options: Record<string, unknown> } | undefined
const unmount = vi.fn()
const detectHost = vi.fn(async () => ({ os: 'linux' as const, arch: 'x64' as const }))
const surveyEngines = vi.fn(async (): Promise<EngineStatus[]> => [])

vi.mock('ink', () => ({
  render: (element: ReactElement<AppProps>, options: Record<string, unknown>) => {
    rendered = { element, options }
    return { unmount }
  },
}))
vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  return { ...actual, detectHost: () => detectHost() }
})
vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return { ...actual, surveyEngines: () => surveyEngines() }
})

const { mountWizard } = await import('../../src/wizard/run.js')
const { App } = await import('../../src/wizard/App.js')

const dockerStatus: EngineStatus = {
  name: 'docker',
  displayName: 'Docker',
  platform: { supported: true },
  detect: { available: true },
  capabilities: createDriver('docker').capabilities,
  recommended: true,
}

const props = () => rendered!.element.props

/** mountWizard awaits host detection + the engine survey before it renders. */
const untilRendered = () => new Promise((r) => setTimeout(r, 10))

beforeEach(() => {
  rendered = undefined
  unmount.mockClear()
  surveyEngines.mockResolvedValue([dockerStatus])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('mountWizard', () => {
  it('renders App seeded with the flag input and the surveyed engines', async () => {
    const promise = mountWizard({ initial: { name: 'seed', fallbackName: 'cwd' } })
    await untilRendered()
    expect(rendered!.element.type).toBe(App)
    expect(props().initial).toEqual({ name: 'seed', fallbackName: 'cwd' })
    expect(props().engines).toEqual([dockerStatus])
    // ink's own ctrl-C handling is disabled; App cancels explicitly instead.
    expect(rendered!.options).toEqual({ exitOnCtrlC: false })

    props().onCancel()
    await promise
  })

  it('resolves with the authored spec and unmounts the UI', async () => {
    const promise = mountWizard({ initial: {} })
    await untilRendered()
    const spec = { name: 'authored', engine: 'auto', selections: {}, hardening: [], ssh: true } as EnvSpec

    props().onComplete(spec)

    await expect(promise).resolves.toBe(spec)
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('resolves with null when the wizard is cancelled', async () => {
    const promise = mountWizard({ initial: {} })
    await untilRendered()
    props().onCancel()
    await expect(promise).resolves.toBeNull()
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('settles once: a late callback cannot re-resolve or double-unmount', async () => {
    const promise = mountWizard({ initial: {} })
    await untilRendered()
    const spec = { name: 'first', engine: 'auto', selections: {}, hardening: [], ssh: true } as EnvSpec

    props().onComplete(spec)
    props().onCancel()
    props().onComplete({ ...spec, name: 'second' })

    await expect(promise).resolves.toBe(spec)
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('detects the host before surveying engines', async () => {
    const promise = mountWizard({ initial: {} })
    await untilRendered()
    expect(detectHost).toHaveBeenCalledOnce()
    expect(surveyEngines).toHaveBeenCalledOnce()
    props().onCancel()
    await promise
  })
})
