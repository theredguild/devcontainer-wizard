import { StrictHardeningError } from '../errors.js'
import type { EngineCapabilities, EngineName } from '../engine/types.js'
import { capabilityFor, type HardeningEffect } from './effects.js'
import { emitFlags, flagNeedsUserns } from './flag-emitters.js'

export type WarningLevel = 'caveat' | 'dropped'

export interface HardeningWarning {
  level: WarningLevel
  effect: string
  message: string
}

export interface TranslateResult {
  /** Engine-correct run flags, in effect order. */
  flags: string[]
  warnings: HardeningWarning[]
  /** Effects that were dropped because the engine cannot honor them. */
  dropped: HardeningEffect[]
  /** Caveated effects whose control may be silently inert (enforced: false). */
  unenforced: HardeningEffect[]
}

function describe(effect: HardeningEffect): string {
  switch (effect.kind) {
    case 'tmpfs':
      return `tmpfs ${effect.target}`
    case 'drop-cap':
      return `drop-cap ${effect.cap}`
    case 'sysctl':
      return `sysctl ${effect.key}`
    case 'noop':
      return effect.source
    default:
      return effect.kind
  }
}

/**
 * Translate engine-neutral hardening effects into engine-correct run flags,
 * degrading gracefully: supported → emit; caveated → emit + advisory;
 * unsupported → drop + warning. Pure and fully testable against fake capability
 * maps — no daemon required.
 */
export function translate(
  effects: HardeningEffect[],
  capabilities: EngineCapabilities,
  engine: EngineName,
): TranslateResult {
  const flags: string[] = []
  const warnings: HardeningWarning[] = []
  const dropped: HardeningEffect[] = []
  const unenforced: HardeningEffect[] = []

  for (const effect of effects) {
    const capKey = capabilityFor(effect)

    // Always-applicable effects (noop) surface an advisory but emit nothing.
    if (capKey === null) {
      if (effect.kind === 'noop') {
        warnings.push({ level: 'caveat', effect: describe(effect), message: effect.reason })
      }
      continue
    }

    const cap = capabilities[capKey]
    if (cap.support === 'unsupported') {
      dropped.push(effect)
      warnings.push({
        level: 'dropped',
        effect: describe(effect),
        message: cap.note ?? `${engine} does not support this hardening; it was dropped.`,
      })
      continue
    }

    flags.push(...emitFlags(effect, engine))

    if (cap.support === 'caveated') {
      if (cap.note) warnings.push({ level: 'caveat', effect: describe(effect), message: cap.note })
      if (cap.enforced === false) unenforced.push(effect)
    }
  }

  // Rootless Podman needs uid/gid-mapped tmpfs to be remapped via keep-id.
  if (engine === 'podman' && flags.some((f) => flagNeedsUserns(f))) {
    flags.unshift('--userns=keep-id')
    warnings.push({
      level: 'caveat',
      effect: 'userNamespaces',
      message: 'Added --userns=keep-id so uid/gid-mapped tmpfs mounts work under rootless Podman.',
    })
  }

  return { flags, warnings, dropped, unenforced }
}

/**
 * Machine-readable summary of what hardening actually reached the engine.
 *
 * Human-facing output prints `warnings` via `this.warn`, but `--json` consumers
 * (AI agents, CI) see only the return envelope — so every command that starts or
 * attaches to a container must surface this, or a dropped control (e.g. an
 * air-gap the engine cannot enforce) becomes invisible exactly where it matters
 * most. Keep the shape identical across commands.
 */
export interface HardeningReport {
  /** Run flags actually passed to the engine. */
  appliedFlags: string[]
  warnings: HardeningWarning[]
  /** Effect kinds the engine cannot honor at all — these were NOT applied. */
  dropped: string[]
  /** Effect kinds emitted but possibly inert (engine reports them as unenforced). */
  unenforced: string[]
}

/** Build the machine-readable hardening summary for a `--json` response. */
export function hardeningReport(result: TranslateResult, appliedFlags: string[]): HardeningReport {
  return {
    appliedFlags,
    warnings: result.warnings,
    dropped: result.dropped.map((e) => e.kind),
    unenforced: result.unenforced.map((e) => e.kind),
  }
}

/** Throw under --strict if any hardening was dropped or may be silently inert. */
export function enforceStrict(result: TranslateResult): void {
  const blocking = [...result.dropped, ...result.unenforced]
  if (blocking.length === 0) return
  const list = blocking.map((e) => describe(e)).join(', ')
  throw new StrictHardeningError(
    `--strict: the selected engine cannot honor: ${list}. Choose a different engine or remove these options.`,
  )
}
