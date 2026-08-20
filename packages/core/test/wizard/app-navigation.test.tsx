import { render } from 'ink-testing-library'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/wizard/App.js'
import { createDriver } from '../../src/engine/registry.js'
import type { EngineStatus } from '../../src/engine/resolver.js'
import type { EnvSpec } from '../../src/spec/env-spec.js'
import { BACKSPACE, CTRL_C, DOWN, ENTER, ESC, SPACE, UP, tick, type } from './keys.js'

function engines(): EngineStatus[] {
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
      name: 'podman',
      displayName: 'Podman',
      platform: { supported: true },
      detect: { available: false },
      capabilities: createDriver('podman').capabilities,
      recommended: false,
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

function mount(initial: Record<string, unknown> = { fallbackName: 'my-proj' }, list = engines()) {
  const onComplete = vi.fn<(spec: EnvSpec) => void>()
  const onCancel = vi.fn()
  const r = render(createElement(App, { initial: initial as never, engines: list, onComplete, onCancel }))
  return { ...r, onComplete, onCancel }
}

/** Advance `steps` screens by accepting the current default on each. */
async function accept(r: ReturnType<typeof mount>, steps: number) {
  await type(r.stdin, ...Array.from({ length: steps }, () => ENTER))
}

describe('wizard engine step', () => {
  it('offers auto-detect first, naming the recommended engine', async () => {
    const r = mount()
    await tick()
    const frame = r.lastFrame() ?? ''
    expect(frame).toContain('Step 1/10 — Container engine')
    expect(frame).toContain('Auto-detect')
    expect(frame).toContain('Recommended: docker')
  })

  it('says so when nothing was detected', async () => {
    const r = mount({ fallbackName: 'p' }, engines().map((e) => ({ ...e, recommended: false })))
    await tick()
    expect(r.lastFrame()).toContain('No engine detected yet')
  })

  it("annotates each engine's availability and version", async () => {
    const r = mount()
    await type(r.stdin, DOWN)
    expect(r.lastFrame()).toContain('available — Docker 99')
    await type(r.stdin, DOWN)
    expect(r.lastFrame()).toContain('not detected')
  })

  it('disables an engine that cannot run on this host', async () => {
    const r = mount()
    await tick()
    expect(r.lastFrame()).toContain('Apple Containers')
    expect(r.lastFrame()).toContain('(unavailable)')
  })

  it('cancels rather than navigating back from the first step', async () => {
    const r = mount()
    await type(r.stdin, ESC)
    expect(r.onCancel).toHaveBeenCalledOnce()
  })

  it('records the chosen engine in the final spec', async () => {
    const r = mount()
    await type(r.stdin, DOWN, ENTER)
    await accept(r, 9)
    expect(r.onComplete).toHaveBeenCalledOnce()
    expect(r.onComplete.mock.calls[0]![0].engine).toBe('docker')
  })
})

describe('wizard navigation', () => {
  it('cancels on ctrl-c from any step', async () => {
    const r = mount()
    await type(r.stdin, ENTER, CTRL_C)
    expect(r.onCancel).toHaveBeenCalled()
  })

  it('starts with a blank name when neither --name nor a directory name is supplied', async () => {
    const r = mount({})
    await accept(r, 1)
    expect(r.lastFrame()).toContain('Step 2/10 — Name')
    expect(r.lastFrame()).toMatch(/Environment name:\s*▏/)
  })

  it('walks back to a previous step with Esc, keeping what was entered', async () => {
    const r = mount()
    await accept(r, 2)
    expect(r.lastFrame()).toContain('Step 3/10 — Core languages')
    await type(r.stdin, ESC)
    expect(r.lastFrame()).toContain('Step 2/10 — Name')
    expect(r.lastFrame()).toContain('my-proj')
  })

  it('keeps the previous name when the text field is cleared and submitted empty', async () => {
    const r = mount({ name: 'seeded', fallbackName: 'fallback' })
    await accept(r, 1)
    await type(r.stdin, ...Array.from({ length: 6 }, () => BACKSPACE), ENTER)
    await accept(r, 8)
    expect(r.onComplete.mock.calls[0]![0].name).toBe('seeded')
  })

  it('lets the name be retyped', async () => {
    const r = mount()
    await accept(r, 1)
    await type(r.stdin, ...Array.from({ length: 8 }, () => BACKSPACE), 'r', 'e', 'n', 'a', 'm', 'e', 'd', ENTER)
    await accept(r, 8)
    expect(r.onComplete.mock.calls[0]![0].name).toBe('renamed')
  })

  it('seeds EVERY multi-select category from the flags, not just the first', async () => {
    // All six steps render the same component type at the same position; without
    // a per-step key React reuses one instance, so only the first category's
    // seeded selection ever reached the spec.
    const r = mount({
      fallbackName: 'p',
      coreLanguages: ['rust'],
      languages: ['solidity'],
      frameworks: ['foundry'],
      fuzzingAndTesting: ['echidna'],
      securityTooling: ['slither'],
      aiAgents: ['claude'],
    })
    await accept(r, 10)
    expect(r.onComplete.mock.calls[0]![0].selections).toEqual({
      coreLanguages: ['rust'],
      languages: ['solidity'],
      frameworks: ['foundry'],
      fuzzingAndTesting: ['echidna'],
      securityTooling: ['slither'],
      aiAgents: ['claude'],
    })
  })

  it('starts each multi-select step at the top rather than inheriting the last cursor', async () => {
    const r = mount()
    await accept(r, 2)
    await type(r.stdin, DOWN, ENTER)
    expect(r.lastFrame()).toContain('Step 4/10 — Smart-contract languages')
    expect(r.lastFrame()).toContain('❯ ◯ Solidity')
  })

  it('carries multi-select choices through to the spec', async () => {
    const r = mount()
    await accept(r, 2)
    await type(r.stdin, SPACE, ENTER)
    await accept(r, 7)
    expect(r.onComplete.mock.calls[0]![0].selections.coreLanguages).toEqual(['rust'])
  })
})

describe('wizard hardening step', () => {
  it('offers a custom mode that picks individual hardening options', async () => {
    const r = mount()
    await accept(r, 8)
    expect(r.lastFrame()).toContain('Step 9/10 — Hardening')

    // "Custom…" sits directly above "None", i.e. two rows up from the top.
    await type(r.stdin, UP, UP, ENTER)
    expect(r.lastFrame()).toContain('Read-only root filesystem')

    await type(r.stdin, SPACE, ENTER, ENTER)
    const spec = r.onComplete.mock.calls[0]![0]
    expect(spec.hardening).toEqual(['readonly-os'])
    expect(spec.profile).toBeUndefined()
  })

  it('can step back out of the custom list', async () => {
    const r = mount()
    await accept(r, 8)
    await type(r.stdin, UP, UP, ENTER)
    expect(r.lastFrame()).toContain('Read-only root filesystem')
    await type(r.stdin, ESC)
    expect(r.lastFrame()).toContain('Step 8/10 — AI coding agents')
  })

  it('pre-selects the profile passed in as a flag', async () => {
    const r = mount({ fallbackName: 'p', profile: 'paranoid' })
    await accept(r, 8)
    await type(r.stdin, ENTER, ENTER)
    expect(r.onComplete.mock.calls[0]![0].profile).toBe('paranoid')
  })
})

describe('wizard review step', () => {
  it('summarizes every chosen category', async () => {
    const r = mount({
      fallbackName: 'p',
      coreLanguages: ['rust'],
      languages: ['solidity'],
      frameworks: ['foundry'],
      fuzzingAndTesting: ['echidna'],
      securityTooling: ['slither'],
      aiAgents: ['claude'],
    })
    await accept(r, 9)
    const frame = r.lastFrame() ?? ''
    expect(frame).toContain('name: p')
    expect(frame).toContain('core: rust')
    expect(frame).toContain('languages: solidity')
    expect(frame).toContain('frameworks: foundry')
    expect(frame).toContain('fuzzing: echidna')
    expect(frame).toContain('security: slither')
    expect(frame).toContain('ai agents: claude')
    expect(frame).toContain('enter to create · esc to go back')
  })

  it('shows which engine auto-detect would resolve to', async () => {
    const r = mount()
    await accept(r, 9)
    expect(r.lastFrame()).toContain('engine: auto (→ docker)')
  })

  it("reports 'hardening: none' when the user opted out", async () => {
    const r = mount()
    await accept(r, 8)
    await type(r.stdin, UP, ENTER)
    expect(r.lastFrame()).toContain('hardening: none')
  })

  it('warns when the chosen engine cannot honor the requested hardening', async () => {
    const supported = engines().map((e) =>
      e.name === 'apple-container' ? { ...e, platform: { supported: true }, detect: { available: true } } : e,
    )
    const r = mount({ fallbackName: 'p', profile: 'airgapped' }, supported)
    await type(r.stdin, DOWN, DOWN, DOWN, ENTER)
    await accept(r, 8)
    expect(r.lastFrame()).toContain('apple-container cannot honor')
  })

  it('refuses to build a spec it cannot validate, and offers a way back', async () => {
    // A credential-bearing git remote is rejected by the EnvSpec schema, so the
    // review step has nothing valid to confirm.
    const r = mount({ fallbackName: 'p', gitUrl: 'https://user:tok@example.com/a/b.git' })
    await accept(r, 9)
    expect(r.lastFrame()).toContain('Cannot build spec:')
    expect(r.lastFrame()).toContain('esc to go back')

    await type(r.stdin, ENTER)
    expect(r.onComplete).not.toHaveBeenCalled()

    await type(r.stdin, ESC)
    expect(r.lastFrame()).toContain('Step 9/10 — Hardening')
  })

  it('confirms on Enter and goes back on Esc', async () => {
    const r = mount()
    await accept(r, 9)
    await type(r.stdin, ESC)
    expect(r.lastFrame()).toContain('Step 9/10 — Hardening')
    await type(r.stdin, ENTER, ENTER)
    expect(r.onComplete).toHaveBeenCalledOnce()
  })
})
