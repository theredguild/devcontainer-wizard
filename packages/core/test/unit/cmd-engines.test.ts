import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EngineStatus } from '../../src/engine/resolver.js'
import { caps, fullCaps } from '../../src/engine/drivers/capabilities.js'
import { runCommand } from '../helpers/command.js'

const detectHost = vi.fn(async () => ({ os: 'macos', arch: 'arm64', macosMajor: 15 }))
const surveyEngines = vi.fn(async (): Promise<EngineStatus[]> => [])

vi.mock('../../src/engine/host.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/host.js')>()
  return { ...actual, detectHost: (...a: unknown[]) => detectHost(...(a as [])) }
})
vi.mock('../../src/engine/resolver.js', async (orig) => {
  const actual = await orig<typeof import('../../src/engine/resolver.js')>()
  return { ...actual, surveyEngines: (...a: unknown[]) => surveyEngines(...(a as [])) }
})

const { default: Engines } = await import('../../src/commands/engines.js')

function status(over: Partial<EngineStatus> & Pick<EngineStatus, 'name'>): EngineStatus {
  return {
    displayName: over.name,
    platform: { supported: true },
    detect: { available: true, version: '1.0' },
    capabilities: caps(),
    recommended: false,
    ...over,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('dcw engines', () => {
  it('reports host info and each engine\'s support, availability and recommendation', async () => {
    surveyEngines.mockResolvedValue([
      status({ name: 'orbstack', displayName: 'OrbStack', recommended: true }),
      status({ name: 'docker', displayName: 'Docker', detect: { available: false, reason: 'not installed' } }),
      status({
        name: 'lima',
        displayName: 'Lima',
        platform: { supported: false, reason: 'Lima runs on macOS and Linux only.' },
        detect: undefined,
      }),
    ])

    const { result } = await runCommand<{
      host: { os: string; arch: string; macosMajor?: number }
      engines: Array<Record<string, unknown>>
    }>(Engines, { json: true })

    expect(result?.host).toEqual({ os: 'macos', arch: 'arm64', macosMajor: 15 })
    expect(result?.engines.map((e) => e.name)).toEqual(['orbstack', 'docker', 'lima'])
    expect(result?.engines[0]).toMatchObject({ available: true, recommended: true, version: '1.0' })
    expect(result?.engines[1]).toMatchObject({ available: false, recommended: false })
    expect(result?.engines[2]).toMatchObject({
      supported: false,
      reason: 'Lima runs on macOS and Linux only.',
      available: undefined,
    })
  })

  it('splits capability notes into caveats and unsupported drops', async () => {
    surveyEngines.mockResolvedValue([
      status({
        name: 'apple-container',
        displayName: 'Apple Containers',
        capabilities: fullCaps({
          ...caps(),
          apparmor: { support: 'unsupported', note: 'no AppArmor in this VM' },
          seccomp: { support: 'caveated', note: 'default profile only' },
          // Note-less entries must still be reported, with a generic label.
          sysctl: { support: 'unsupported' },
          dns: { support: 'caveated' },
        }),
      }),
    ])

    const { result } = await runCommand<{ engines: Array<{ caveats: string[]; unsupported: string[] }> }>(Engines, {
      json: true,
    })

    expect(result?.engines[0]?.caveats).toEqual(['seccomp: default profile only', 'dns: caveat'])
    expect(result?.engines[0]?.unsupported).toEqual(['apparmor: no AppArmor in this VM', 'sysctl: unsupported'])
  })

  it('renders a human table with per-engine marks and the dropped-capability line', async () => {
    surveyEngines.mockResolvedValue([
      status({ name: 'orbstack', displayName: 'OrbStack', recommended: true }),
      status({ name: 'podman', displayName: 'Podman', detect: { available: true, version: '5.2' } }),
      status({ name: 'lima', displayName: 'Lima (nerdctl)', detect: { available: true } }),
      status({ name: 'docker', displayName: 'Docker', detect: { available: false } }),
      status({
        name: 'lima',
        displayName: 'Lima',
        platform: { supported: false },
        detect: undefined,
      }),
      status({
        name: 'apple-container',
        displayName: 'Apple Containers',
        capabilities: fullCaps({ ...caps(), apparmor: { support: 'unsupported', note: 'n/a' } }),
      }),
    ])

    const { logs } = await runCommand(Engines, { json: false })
    const text = logs.join('\n')

    expect(text).toContain('Host: macOS 15 (arm64)')
    expect(text).toMatch(/★ {2}OrbStack {13}available — 1\.0 {2}\[recommended]/)
    expect(text).toMatch(/✓ {2}Podman {15}available — 5\.2/)
    // An available engine that reported no version string still reads cleanly.
    expect(text).toContain('✓  Lima (nerdctl)       available\n')
    expect(text).toMatch(/· {2}Docker {15}not detected/)
    // Unsupported engines report the reason, falling back to 'n/a' when absent.
    expect(text).toMatch(/✗ Lima {17}unsupported \(n\/a\)/)
    // Only the capability KEY is shown on the drops line, not the whole note.
    expect(text).toContain('     drops: apparmor')
  })
})
