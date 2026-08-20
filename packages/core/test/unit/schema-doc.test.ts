import { describe, expect, it } from 'vitest'
import { buildSchemaDoc } from '../../src/spec/schema-doc.js'
import { CATALOG } from '../../src/domain/catalog.js'

describe('buildSchemaDoc', () => {
  const doc = buildSchemaDoc('9.9.9')

  it('includes the EnvSpec JSON schema', () => {
    expect(doc.version).toBe('9.9.9')
    const json = doc.envSpec as { $ref?: string; definitions?: Record<string, unknown> }
    expect(json.definitions?.EnvSpec).toBeDefined()
  })

  it('exposes every catalog category and its options', () => {
    expect(doc.catalog).toHaveLength(CATALOG.length)
    const core = doc.catalog.find((c) => c.key === 'coreLanguages')!
    expect(core.options.map((o) => o.value)).toEqual(['rust', 'python', 'go', 'node'])
  })

  it('lists profiles, hardening options, and engines', () => {
    expect(doc.profiles.some((p) => p.key === 'hardened')).toBe(true)
    expect(doc.hardening.some((h) => h.key === 'drop-caps')).toBe(true)
    expect(doc.engines).toContain('apple-container')
  })
})
