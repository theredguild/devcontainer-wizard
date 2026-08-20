import { describe, expect, it } from 'vitest'
import { ALL_ENGINES, createAllDrivers, createDriver } from '../../src/engine/registry.js'

describe('engine registry', () => {
  it('creates a driver for every declared engine name', () => {
    for (const name of ALL_ENGINES) {
      expect(createDriver(name).name).toBe(name)
    }
  })

  it('creates the full driver set, in declaration order', () => {
    expect(createAllDrivers().map((d) => d.name)).toEqual([...ALL_ENGINES])
  })

  it('gives every driver a display name and a complete capability map', () => {
    for (const driver of createAllDrivers()) {
      expect(driver.displayName).toBeTruthy()
      expect(Object.keys(driver.capabilities).length).toBeGreaterThan(0)
    }
  })

  it('refuses an unknown engine name rather than returning a half-driver', () => {
    // The exhaustive `never` switch makes this unreachable from typed callers;
    // it still has to hold for values that arrive from JSON/manifests at runtime.
    expect(() => createDriver('nerdctl' as never)).toThrow('Unknown engine: nerdctl')
  })
})
