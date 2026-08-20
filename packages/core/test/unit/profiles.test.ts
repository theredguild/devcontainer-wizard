import { describe, expect, it } from 'vitest'
import { PROFILES, recipesToHardening } from '../../src/domain/profiles.js'
import { normalizeHardening } from '../../src/domain/normalize.js'

describe('recipesToHardening', () => {
  it('expands development profile', () => {
    const keys = recipesToHardening(['development'])
    expect(keys).toEqual(expect.arrayContaining(['secure-tmp', 'no-new-privs', 'apparmor', 'secure-dns', 'vscode-security']))
  })

  it('airgapped includes network-none', () => {
    expect(recipesToHardening(['airgapped'])).toContain('network-none')
  })

  it('paranoid includes readonly-os and network-none', () => {
    const keys = recipesToHardening(['paranoid'])
    expect(keys).toEqual(expect.arrayContaining(['readonly-os', 'network-none']))
  })

  it('unions and dedupes across multiple profiles', () => {
    const keys = recipesToHardening(['development', 'hardened'])
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('drop-caps')
  })

  it('every profile expands only to canonical hardening keys', () => {
    for (const profile of PROFILES) {
      const { unknown } = normalizeHardening(profile.choices)
      expect(unknown, `profile ${profile.key} has unknown keys`).toEqual([])
    }
  })

  it('ignores unknown profile keys', () => {
    expect(recipesToHardening(['nonexistent'])).toEqual([])
  })
})

describe('normalizeHardening', () => {
  it('maps legacy resource-limits aliases to canonical keys', () => {
    expect(normalizeHardening(['resource-limits']).keys).toEqual(['resource-limits-light'])
    expect(normalizeHardening(['resource-limits-medium']).keys).toEqual(['resource-limits-standard'])
  })

  it('collapses conflicting resource tiers to the strongest', () => {
    const { keys } = normalizeHardening(['resource-limits-light', 'resource-limits-heavy'])
    expect(keys).toEqual(['resource-limits-heavy'])
  })

  it('reports unknown keys', () => {
    const { keys, unknown } = normalizeHardening(['drop-caps', 'bogus'])
    expect(keys).toEqual(['drop-caps'])
    expect(unknown).toEqual(['bogus'])
  })

  it('dedupes and returns canonical order', () => {
    const { keys } = normalizeHardening(['secure-dns', 'drop-caps', 'drop-caps'])
    // canonical catalog order: drop-caps comes before secure-dns
    expect(keys).toEqual(['drop-caps', 'secure-dns'])
  })
})
