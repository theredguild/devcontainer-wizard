import { describe, expect, it } from 'vitest'
import { hardeningToEffects } from '../../src/hardening/effects.js'
import { enforceStrict, translate } from '../../src/hardening/translator.js'
import { StrictHardeningError } from '../../src/errors.js'
import { createDriver } from '../../src/engine/registry.js'
import { dockerCaps } from '../../src/engine/drivers/capabilities.js'
import type { HardeningKey } from '../../src/domain/hardening.js'

const caps = (engine: 'docker' | 'podman' | 'apple-container' | 'lima') => createDriver(engine).capabilities

// Docker's AppArmor stance depends on what the daemon reports, so pin it explicitly
// — otherwise these assertions would pass against an AppArmor-capable daemon and
// fail against the Linux VM Docker runs on macOS, or vice versa.
function flagsFor(
  keys: HardeningKey[],
  engine: 'docker' | 'podman' | 'apple-container' | 'lima',
  daemonHasApparmor = true,
) {
  const capabilities = engine === 'docker' ? dockerCaps(daemonHasApparmor) : caps(engine)
  return translate(hardeningToEffects(keys), capabilities, engine)
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
  it('drops apparmor / no-new-privs but keeps cap-drop, which the CLI does enforce', () => {
    // Verified against `container` CLI 1.0.0: --cap-drop ALL takes CapEff from
    // 00000000a80425fb to 0000000000000000, so dropping it would discard real,
    // enforced hardening. AppArmor and no-new-privileges genuinely are not exposed.
    const { flags, dropped, warnings } = flagsFor(['drop-caps', 'apparmor', 'no-new-privs'], 'apple-container')
    expect(flags).toEqual(['--cap-drop=ALL'])
    expect(dropped.map((e) => e.kind).sort()).toEqual(['apparmor', 'no-new-privs'])
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

  it('does not throw for advisory caveats on docker (daemon has AppArmor)', () => {
    const result = flagsFor(['apparmor'], 'docker', true)
    expect(result.unenforced).toEqual([])
    expect(() => enforceStrict(result)).not.toThrow()
  })

  it('throws when the daemon lacks AppArmor, where the flag is accepted but inert', () => {
    // Verified on OrbStack 29.4.0 / macOS: `docker inspect` reports an empty
    // AppArmorProfile and the container has no LSM, so --strict must fail closed
    // rather than certify a control that is not enforced.
    const result = flagsFor(['apparmor'], 'docker', false)
    expect(result.flags).toContain('apparmor=docker-default')
    expect(result.unenforced.map((e) => e.kind)).toContain('apparmor')
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
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
    const result = flagsFor(['apparmor'], 'apple-container')
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
  })

  it('throws for a control the engine emits but cannot enforce', () => {
    // macOS Docker accepts the AppArmor flag but has no LSM to apply it, so the
    // control is emitted yet inert — --strict must not accept that silently.
    const result = flagsFor(['apparmor'], 'docker', false)
    expect(result.flags).toContain('apparmor=docker-default')
    expect(result.unenforced.length).toBeGreaterThan(0)
    expect(() => enforceStrict(result)).toThrow(StrictHardeningError)
  })

  it('does not throw when nothing was dropped', () => {
    const result = flagsFor(['drop-caps'], 'docker')
    expect(() => enforceStrict(result)).not.toThrow()
  })
})
