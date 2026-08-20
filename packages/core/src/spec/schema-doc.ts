import { zodToJsonSchema } from 'zod-to-json-schema'
import { CATALOG } from '../domain/catalog.js'
import { HARDENING_OPTIONS } from '../domain/hardening.js'
import { PROFILES } from '../domain/profiles.js'
import { ALL_ENGINES } from '../engine/types.js'
import { EnvSpecSchema } from './env-spec.js'

/**
 * Self-describing capability document for agents: the EnvSpec JSON Schema plus
 * the full option vocabulary (catalog, profiles, hardening, engines). A single
 * source — derived from the same zod schema + registries the CLI enforces.
 */
export function buildSchemaDoc(version: string) {
  return {
    version,
    envSpec: zodToJsonSchema(EnvSpecSchema, 'EnvSpec'),
    catalog: CATALOG.map((c) => ({
      key: c.key,
      title: c.title,
      multi: c.multi,
      options: c.items.map((i) => ({ value: i.value, label: i.label, description: i.description })),
    })),
    profiles: PROFILES.map((p) => ({
      key: p.key,
      label: p.label,
      description: p.description,
      caveat: p.caveat,
      experimental: p.experimental,
    })),
    hardening: HARDENING_OPTIONS.map((h) => ({
      key: h.key,
      label: h.label,
      description: h.description,
      category: h.category,
    })),
    engines: ALL_ENGINES,
  }
}

export type SchemaDoc = ReturnType<typeof buildSchemaDoc>
