import { describe, expect, it } from 'vitest'
import { CAPABILITY_KEYS } from '../../src/engine/drivers/capabilities.js'
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
      'networkNone',
      'capDrop',
      'noNewPrivs',
      'apparmor',
      'seccomp',
      'readOnlyRootfs',
    ] as const
    for (const key of mustBeUnsupported) {
      expect(caps[key].support, key).toBe('unsupported')
    }
  })
})
