import { describe, expect, it } from 'vitest'
import { CAPABILITY_KEYS, daemonReportsApparmor, dockerCaps } from '../../src/engine/drivers/capabilities.js'
import { createAllDrivers, createDriver } from '../../src/engine/registry.js'

describe('engine capabilities (#4 — fail-closed coverage)', () => {
  it('every driver addresses every capability key with a valid support level', () => {
    for (const driver of createAllDrivers()) {
      for (const key of CAPABILITY_KEYS) {
        const cap = driver.capabilities[key]
        expect(cap, `${driver.name}.${key}`).toBeDefined()
        expect(['supported', 'caveated', 'unsupported']).toContain(cap.support)
      }
    }
  })

  it('apple-container does not claim Docker-only security controls as supported', () => {
    const caps = createDriver('apple-container').capabilities
    // The `container` CLI exposes none of these; a silent 'supported' default
    // (the original networkNone bug) would let a paranoid/airgapped env pass
    // --strict while the control is not actually applied.
    const mustBeUnsupported = [
      'networkNone', 'noNewPrivs', 'apparmor', 'seccomp', 'sysctl',
      // tmpfs options are not parsed by this CLI, and read-only rootfs is unusable
      // without the uid-mapped tmpfs mounts it is always paired with.
      'tmpfs', 'readOnlyRootfs',
    ] as const
    for (const key of mustBeUnsupported) {
      expect(caps[key].support, key).toBe('unsupported')
    }

    // Conversely, cap-drop IS exposed and enforced by this CLI (verified against
    // container 1.0.0: CapEff -> 0), so declaring it unsupported would discard real
    // hardening. Fail-closed must not become fail-blind.
    expect(caps.capDrop.support).toBe('supported')
  })
})

describe('dockerCaps — AppArmor depends on the daemon, not the client host', () => {
  it('treats AppArmor as enforced when the daemon reports it', () => {
    const c = dockerCaps(true)
    expect(c.apparmor.support).toBe('supported')
    expect(c.apparmor.enforced).toBeUndefined()
  })

  it('marks AppArmor unenforced when the daemon does not report it', () => {
    // e.g. the Linux VM Docker/OrbStack run on macOS: the flag is accepted, but
    // `docker inspect` comes back with an empty AppArmorProfile.
    const c = dockerCaps(false)
    expect(c.apparmor.support).toBe('caveated')
    expect(c.apparmor.enforced).toBe(false)
    expect(c.apparmor.note).toMatch(/not enforced/)
  })

  it('fails closed when the daemon could not be probed', () => {
    // Claiming an unverified control is the failure --strict exists to prevent.
    const c = dockerCaps(undefined)
    expect(c.apparmor.support).toBe('caveated')
    expect(c.apparmor.enforced).toBe(false)
  })

  it('leaves every other Docker control fully supported either way', () => {
    for (const c of [dockerCaps(true), dockerCaps(false)]) {
      for (const key of ['capDrop', 'readOnlyRootfs', 'networkNone', 'noNewPrivs', 'seccomp', 'tmpfs'] as const) {
        expect(c[key].support, key).toBe('supported')
      }
    }
  })

  it('reads AppArmor availability out of real `docker info` SecurityOptions', () => {
    // Captured from OrbStack 29.4.0 on macOS (no apparmor) and a Linux daemon.
    expect(daemonReportsApparmor('["name=seccomp,profile=builtin","name=cgroupns"]')).toBe(false)
    expect(daemonReportsApparmor('["name=apparmor","name=seccomp,profile=builtin"]')).toBe(true)
    expect(daemonReportsApparmor('')).toBe(false)
  })
})
