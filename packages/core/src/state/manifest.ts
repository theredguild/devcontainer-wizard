import { z } from 'zod'
import { EnvSpecSchema } from '../spec/env-spec.js'
import { ALL_ENGINES } from '../engine/types.js'

export const SCHEMA_VERSION = 1

export const ToolStatusSchema = z.object({ name: z.string(), ok: z.boolean() })

export const ImageStateSchema = z.object({
  tag: z.string(),
  imageId: z.string().optional(),
  /** sha256 of the generated Containerfile → staleness detection. */
  containerfileHash: z.string(),
  builtAt: z.string().optional(),
  /** Per-tool best-effort install results read back from the image. */
  tools: z.array(ToolStatusSchema).optional(),
})

/** How an environment was wired for editor attach (`dcw attach`). */
export const SshStateSchema = z.object({
  /** 'exec' = ProxyCommand over engine exec (no ports); 'port' = published TCP port. */
  mode: z.enum(['exec', 'port']),
  /** Published host port, when mode === 'port'. */
  port: z.number().int().positive().optional(),
})

export const ContainerStateSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.enum(['running', 'stopped', 'unknown']).optional(),
  startedAt: z.string().optional(),
  /** Exact run flags used (reproducibility/debug). */
  appliedFlags: z.array(z.string()).optional(),
  /** Hardening that degraded on the chosen engine. */
  droppedHardening: z.array(z.string()).optional(),
  /** Editor-attach wiring, set by `dcw attach`. */
  ssh: SshStateSchema.optional(),
})

export const EnvManifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  spec: EnvSpecSchema,
  resolved: z.object({
    requiredTools: z.array(z.string()),
    hardeningKeys: z.array(z.string()),
  }),
  engine: z.enum(ALL_ENGINES as unknown as [string, ...string[]]).nullable(),
  image: ImageStateSchema.nullable(),
  container: ContainerStateSchema.nullable(),
})

export type EnvManifest = z.infer<typeof EnvManifestSchema>
export type ImageState = z.infer<typeof ImageStateSchema>
export type ContainerState = z.infer<typeof ContainerStateSchema>
export type SshState = z.infer<typeof SshStateSchema>
export type ToolStatus = z.infer<typeof ToolStatusSchema>

/** Just the version envelope, parsed before the full (version-locked) schema so we
 *  can tell "older manifest we can migrate" from "newer dcw wrote this". */
export const SchemaVersionSchema = z.object({ schemaVersion: z.number().int().positive() })

/**
 * Migrate a raw manifest object (already known to have schemaVersion <= current)
 * forward to the current shape, then validate it. Only v1 exists today, so this
 * is an identity migration; the `switch` is the seam where future per-version
 * upgrade steps are added (e.g. `case 1: raw = v1ToV2(raw)`).
 */
export function migrateManifest(raw: unknown, fromVersion: number): EnvManifest {
  let migrated = raw
  switch (fromVersion) {
    // case 1: migrated = v1ToV2(migrated); // fall through as versions are added
    default:
      break
  }
  return EnvManifestSchema.parse(migrated)
}
