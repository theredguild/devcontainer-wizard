import { describe, expect, it } from 'vitest'
import { hardeningToEffects } from '../../src/hardening/effects.js'
import { enforceStrict, translate } from '../../src/hardening/translator.js'
import { StrictHardeningError } from '../../src/errors.js'
import { createDriver } from '../../src/engine/registry.js'
import type { HardeningKey } from '../../src/domain/hardening.js'

const caps = (engine: 'docker' | 'podman' | 'apple-container' | 'lima') => createDriver(engine).capabilities

function flagsFor(keys: HardeningKey[], engine: 'docker' | 'podman' | 'apple-container' | 'lima') {
  return translate(hardeningToEffects(keys), caps(engine), engine)
}

describe('hardeningToEffects', () => {
  it('drop-caps subsumes no-raw-packets (only ALL emitted)', () => {
    const effects = hardeningToEffects(['drop-caps', 'no-raw-packets'])
    const caps = effects.filter((e) => e.kind === 'drop-cap')
    expect(caps).toHaveLength(1)
    expect(caps[0]).toMatchObject({ cap: 'ALL' })
  })

  it('network-none supersedes disable-ipv6', () => {
    const effects = hardeningToEffects(['network-none', 'disable-ipv6'])
    expect(effects.some((e) => e.kind === 'sysctl')).toBe(false)
    expect(effects.some((e) => e.kind === 'network-none')).toBe(true)
  })

  it('readonly-os expands to read-only rootfs plus writable tmpfs (no vscode-server mounts)', () => {
    const effects = hardeningToEffects(['readonly-os'])
    expect(effects.some((e) => e.kind === 'readonly-rootfs')).toBe(true)
    const tmpfsTargets = effects.filter((e) => e.kind === 'tmpfs').map((e) => (e as { target: string }).target)
    expect(tmpfsTargets).toContain('/home/vscode/.cache')
    expect(tmpfsTargets.some((t) => t.includes('vscode-server'))).toBe(false)
  })
})

describe('translate — Docker (full support)', () => {
  it('emits the expected flags for a hardened set', () => {
    const { flags, dropped, warnings } = flagsFor(
      ['drop-caps', 'no-new-privs', 'apparmor', 'secure-dns', 'secure-tmp'],
      'docker',
    )
    expect(dropped).toEqual([])
    expect(flags).toContain('--cap-drop=ALL')
    expect(flags).toContain('--security-opt')
    expect(flags).toContain('no-new-privileges:true')
    expect(flags).toContain('apparmor=docker-default')
    expect(flags).toContain('--dns')
    expect(flags).toContain('1.1.1.1')
    expect(warnings).toEqual([])
  })

  it('maps resource tiers', () => {
    const { flags } = flagsFor(['resource-limits-heavy'], 'docker')
    expect(flags).toEqual(['--memory', '4g', '--cpus', '8'])
  })

  it('surfaces a caveat for vscode-security (no-op)', () => {
    const { flags, warnings } = flagsFor(['vscode-security'], 'docker')
    expect(flags).toEqual([])
    expect(warnings.some((w) => w.effect === 'vscode-security' && w.level === 'caveat')).toBe(true)
  })
})

describe('translate — Apple Containers (degrades)', () => {
  it('drops caps / apparmor / no-new-privs with warnings', () => {
    const { flags, dropped, warnings } = flagsFor(['drop-caps', 'apparmor', 'no-new-privs'], 'apple-container')
    expect(flags).toEqual([])
    expect(dropped.map((e) => e.kind).sort()).toEqual(['apparmor', 'drop-cap', 'no-new-privs'])
    expect(warnings.every((w) => w.level === 'dropped')).toBe(true)
  })

  it('drops network-none instead of falsely emitting --network=none', () => {
    // Apple's `container` CLI does not honor Docker's --network=none, so the
    // air-gap must be reported as dropped rather than silently claimed.
    const result = flagsFor(['network-none'], 'apple-container')
    expect(result.flags).not.toContain('--network=none')
    expect(result.dropped.map((e) => e.kind)).toContain('network-none')
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
  })
})

describe('translate — deduplicates tmpfs by target (#9)', () => {
  it('keeps a single, most-restrictive --tmpfs per target', () => {
    // readonly-os mounts /tmp at 1g; secure-tmp mounts /tmp at 512m.
    const { flags } = flagsFor(['readonly-os', 'secure-tmp'], 'docker')
    const tmpSpecs = flags.filter((f, i) => flags[i - 1] === '--tmpfs' && f.startsWith('/tmp:'))
    expect(tmpSpecs).toHaveLength(1)
    expect(tmpSpecs[0]).toContain('size=512m')
  })
})

describe('enforceStrict — no-op caveats (#8)', () => {
  it('throws for a control that is caveated and not enforced (rootless podman AppArmor)', () => {
    const result = flagsFor(['apparmor'], 'podman')
    expect(result.flags).toContain('apparmor=docker-default')
    expect(result.unenforced.map((e) => e.kind)).toContain('apparmor')
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
  })

  it('does not throw for advisory caveats on docker', () => {
    const result = flagsFor(['apparmor'], 'docker')
    expect(result.unenforced).toEqual([])
    expect(() => enforceStrict(result)).not.toThrow()
  })
})

describe('translate — Podman (userns remap)', () => {
  it('injects --userns=keep-id when uid-mapped tmpfs is present', () => {
    const { flags, warnings } = flagsFor(['readonly-os'], 'podman')
    expect(flags[0]).toBe('--userns=keep-id')
    expect(warnings.some((w) => w.effect === 'userNamespaces')).toBe(true)
  })

  it('does not inject keep-id without uid-mapped mounts', () => {
    const { flags } = flagsFor(['secure-tmp'], 'podman')
    expect(flags).not.toContain('--userns=keep-id')
  })

  it('flags AppArmor as caveated but still emits it', () => {
    const { flags, warnings } = flagsFor(['apparmor'], 'podman')
    expect(flags).toContain('apparmor=docker-default')
    expect(warnings.some((w) => w.effect === 'apparmor' && w.level === 'caveat')).toBe(true)
  })
})

describe('enforceStrict', () => {
  it('throws when hardening was dropped', () => {
    const result = flagsFor(['drop-caps'], 'apple-container')
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
  })

  it('does not throw when nothing was dropped', () => {
    const result = flagsFor(['drop-caps'], 'docker')
    expect(() => enforceStrict(result)).not.toThrow()
  })
})
