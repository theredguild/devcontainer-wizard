import { HARDENING_KEYS, isHardeningKey, type HardeningKey } from './hardening.js'

/**
 * Aliases reconciling the inconsistent resource-limit keys that existed across
 * the original wizard's three source files (UI used `resource-limits` /
 * `-medium` / `-heavy`; the flag mapper used `-light` / `-standard` / `-heavy`).
 * One canonical enum lives in `hardening.ts`; everything else maps onto it here.
 */
export const HARDENING_ALIASES: Record<string, HardeningKey> = {
  'resource-limits': 'resource-limits-light',
  'resource-limits-medium': 'resource-limits-standard',
}

const RESOURCE_LIMIT_KEYS: HardeningKey[] = [
  'resource-limits-light',
  'resource-limits-standard',
  'resource-limits-heavy',
]

export interface NormalizeResult {
  keys: HardeningKey[]
  /** Inputs that did not map to any known hardening key. */
  unknown: string[]
}

/**
 * Normalize raw hardening keys: apply aliases, drop duplicates, collapse
 * conflicting resource-limit selections to the strongest, and surface unknowns.
 */
export function normalizeHardening(input: string[]): NormalizeResult {
  const seen = new Set<HardeningKey>()
  const unknown: string[] = []

  for (const raw of input) {
    const mapped = HARDENING_ALIASES[raw] ?? raw
    if (isHardeningKey(mapped)) {
      seen.add(mapped)
    } else {
      unknown.push(raw)
    }
  }

  // Only one resource-limit tier may be active; keep the strongest.
  const tiers = RESOURCE_LIMIT_KEYS.filter((k) => seen.has(k))
  if (tiers.length > 1) {
    for (const t of tiers) seen.delete(t)
    seen.add(tiers[tiers.length - 1]!)
  }

  // Preserve canonical catalog order for determinism.
  const keys = HARDENING_KEYS.filter((k) => seen.has(k))
  return { keys, unknown }
}
