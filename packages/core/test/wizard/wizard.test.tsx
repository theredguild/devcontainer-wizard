import { render } from 'ink-testing-library'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/wizard/App.js'
import { createDriver } from '../../src/engine/registry.js'
import type { EngineStatus } from '../../src/engine/resolver.js'
import type { EnvSpec } from '../../src/spec/env-spec.js'

const ENTER = '\r'

const tick = () => new Promise((r) => setTimeout(r, 30))

function fakeEngines(): EngineStatus[] {
  return [
    {
      name: 'docker',
      displayName: 'Docker',
      platform: { supported: true },
      detect: { available: true, version: 'Docker 99' },
      capabilities: createDriver('docker').capabilities,
      recommended: true,
    },
    {
      name: 'apple-container',
      displayName: 'Apple Containers',
      platform: { supported: false, reason: 'Apple Containers requires macOS.' },
      capabilities: createDriver('apple-container').capabilities,
      recommended: false,
    },
  ]
}

describe('wizard App', () => {
  it('starts on the engine step and shows engine availability', () => {
    const { lastFrame } = render(
      createElement(App, {
        initial: { fallbackName: 'proj' },
        engines: fakeEngines(),
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      }),
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Container engine')
    expect(frame).toContain('Auto-detect')
    expect(frame).toContain('Docker')
    // Unsupported engine is shown disabled.
    expect(frame).toContain('Apple Containers')
    expect(frame).toContain('(unavailable)')
  })

  it('navigates all steps with defaults and produces a spec', async () => {
    const onComplete = vi.fn<(spec: EnvSpec) => void>()
    const { stdin } = render(
      createElement(App, {
        initial: { fallbackName: 'my-proj' },
        engines: fakeEngines(),
        onComplete,
        onCancel: vi.fn(),
      }),
    )

    await tick() // let the first step mount before sending input

    // 10 steps, each accepted with Enter
    // (engine→name→5 multiselects→hardening(development)→review→confirm).
    for (let i = 0; i < 10; i++) {
      stdin.write(ENTER)
      await tick()
    }

    expect(onComplete).toHaveBeenCalledTimes(1)
    const spec = onComplete.mock.calls[0]![0]
    expect(spec.name).toBe('my-proj')
    expect(spec.engine).toBe('auto')
    // Accepting every default must not yield an unhardened environment: the
    // hardening step now leads with `development` rather than "None".
    expect(spec.profile).toBe('development')
    expect(spec.hardening).toContain('no-new-privs')
    expect(spec.hardening).toContain('secure-tmp')
  })

  it('still allows opting out of hardening explicitly', async () => {
    const onComplete = vi.fn<(spec: EnvSpec) => void>()
    const { stdin } = render(
      createElement(App, {
        initial: { fallbackName: 'my-proj' },
        engines: fakeEngines(),
        onComplete,
        onCancel: vi.fn(),
      }),
    )
    await tick()

    // engine → name → 6 multiselects lands on the hardening step (9/10).
    for (let i = 0; i < 8; i++) {
      stdin.write(ENTER)
      await tick()
    }
    // Up wraps to the final choice, which is now "None" rather than the first.
    stdin.write('\u001B[A')
    await tick()
    stdin.write(ENTER) // select None → review
    await tick()
    stdin.write(ENTER) // confirm review
    await tick()

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0]![0].hardening).toEqual([])
  })

  it('parity: wizard defaults match the flag path for the same inputs', async () => {
    const { flagsToSpec } = await import('../../src/spec/flags-to-spec.js')
    const fromFlags = flagsToSpec({ fallbackName: 'my-proj', engine: 'auto' })
    expect(fromFlags.name).toBe('my-proj')
    // Both entry points must land on the same default posture.
    expect(fromFlags.profile).toBe('development')
    expect(fromFlags.hardening).toContain('no-new-privs')

    const optedOut = flagsToSpec({ fallbackName: 'my-proj', engine: 'auto', profile: 'none' })
    expect(optedOut.hardening).toEqual([])
  })
})
