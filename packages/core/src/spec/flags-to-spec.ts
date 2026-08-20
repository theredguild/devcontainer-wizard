import { ValidationError } from '../errors.js'
import { DEFAULT_PROFILE, NO_PROFILE, isProfileKey, recipesToHardening } from '../domain/profiles.js'
import { normalizeHardening } from '../domain/normalize.js'
import { isValidEnvName, slugify } from '../util/slug.js'
import { EnvSpecSchema, type EnvSpec } from './env-spec.js'

export interface FlagInput {
  name?: string
  coreLanguages?: string[]
  languages?: string[]
  frameworks?: string[]
  fuzzingAndTesting?: string[]
  securityTooling?: string[]
  aiAgents?: string[]
  /** Named security profile to expand (e.g. 'hardened'). */
  profile?: string
  /** Manual hardening keys, merged with the profile expansion. */
  hardening?: string[]
  engine?: string
  gitUrl?: string
  gitBranch?: string
  /** Bake an SSH server for editor attach (default true when omitted). */
  ssh?: boolean
  /** Fallback name (e.g. cwd basename) when --name is omitted. */
  fallbackName?: string
}

/** Drop duplicate values while preserving first-seen order. */
function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

function compactSelections(input: FlagInput) {
  const sel: Record<string, string[]> = {}
  if (input.coreLanguages?.length) sel.coreLanguages = dedupe(input.coreLanguages)
  if (input.languages?.length) sel.languages = dedupe(input.languages)
  if (input.frameworks?.length) sel.frameworks = dedupe(input.frameworks)
  if (input.fuzzingAndTesting?.length) sel.fuzzingAndTesting = dedupe(input.fuzzingAndTesting)
  if (input.securityTooling?.length) sel.securityTooling = dedupe(input.securityTooling)
  if (input.aiAgents?.length) sel.aiAgents = dedupe(input.aiAgents)
  return sel
}

/**
 * Build a validated EnvSpec from non-interactive flag inputs. Expands a profile
 * (if given) and merges manual hardening keys, then validates everything against
 * the EnvSpec schema (catalog/hardening enums), raising a ValidationError on
 * any unknown value.
 */
export function flagsToSpec(input: FlagInput): EnvSpec {
  const name = (input.name ?? input.fallbackName ?? '').trim()
  if (!name) {
    throw new ValidationError('An environment name is required (pass --name).')
  }

  const slug = slugify(name)
  if (!isValidEnvName(slug)) {
    // A derived name (cwd basename) that slugifies to a hidden/dot value — e.g.
    // running `create --no-input` inside a `.config` directory — can't be fixed by
    // the user except by naming the env explicitly, so point them at --name.
    const derived = input.name === undefined || input.name.trim() === ''
    if (derived && slug.startsWith('.')) {
      throw new ValidationError(
        `Derived environment name '${slug}' is not usable as an identifier (hidden/dot name); pass --name <name> explicitly.`,
      )
    }
    throw new ValidationError(
      `Environment name '${name}' is not usable as an identifier; use up to 63 characters including letters or digits.`,
    )
  }

  if (input.profile && input.profile !== NO_PROFILE && !isProfileKey(input.profile)) {
    throw new ValidationError(`Unknown profile '${input.profile}'. Use '${NO_PROFILE}' to opt out of hardening.`)
  }

  if (input.gitBranch && !input.gitUrl) {
    throw new ValidationError('--git-branch requires --git-url.')
  }

  // Absence of any choice means the DEFAULT posture, not "no hardening": a bare
  // `dcw create` used to produce an environment with no capability drops, no
  // no-new-privileges and no secure tmpfs — and `--strict` passed vacuously,
  // because nothing had been requested to fail. Naming `--harden` keys is itself a
  // deliberate choice, so the default only applies when nothing at all was given;
  // `--profile none` is the explicit opt-out.
  const choseNothing = !input.profile && (input.hardening ?? []).length === 0
  const effectiveProfile = choseNothing ? DEFAULT_PROFILE : input.profile

  const fromProfile =
    effectiveProfile && effectiveProfile !== NO_PROFILE ? recipesToHardening([effectiveProfile]) : []
  const { keys: hardening, unknown } = normalizeHardening([...fromProfile, ...(input.hardening ?? [])])
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown hardening option(s): ${unknown.join(', ')}.`)
  }

  const candidate = {
    name: slug,
    engine: input.engine ?? 'auto',
    selections: compactSelections(input),
    hardening,
    profile: effectiveProfile,
    gitRepository: input.gitUrl
      ? { url: input.gitUrl, branch: input.gitBranch, enabled: true }
      : undefined,
    ssh: input.ssh ?? true,
  }

  const result = EnvSpecSchema.safeParse(candidate)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new ValidationError(`Invalid selection: ${issue?.path.join('.')} — ${issue?.message}.`)
  }
  return result.data
}
