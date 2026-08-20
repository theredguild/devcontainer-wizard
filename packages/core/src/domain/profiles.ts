import { normalizeHardening } from './normalize.js'
import type { HardeningKey } from './hardening.js'

/**
 * Named security profiles → hardening key sets. Ported from the original
 * wizard's RECIPE_MAPPINGS. Keys are normalized through `normalizeHardening`
 * so any legacy aliases resolve to the canonical vocabulary.
 */
export interface ProfileDefinition {
  key: ProfileKey
  label: string
  description: string
  caveat: string
  experimental: boolean
  choices: string[]
}

export type ProfileKey =
  | 'development'
  | 'hardened'
  | 'airgapped'
  | 'paranoid'
  | 'network-restricted-analysis'
  | 'ci-like-local-runner'
  | 'package-install-session'
  | 'security-research-controlled-net'

export const PROFILES: ProfileDefinition[] = [
  {
    key: 'development',
    label: 'Development',
    description: 'Balanced security for daily development work.',
    caveat: 'Standard development environment with basic security hardening.',
    experimental: false,
    choices: ['secure-tmp', 'no-new-privs', 'apparmor', 'secure-dns', 'vscode-security'],
  },
  {
    key: 'hardened',
    label: 'Hardened',
    description: 'Enhanced security for smart contract auditing and security research.',
    caveat: 'Packet-crafting tools will not work due to no-raw-packets restriction.',
    experimental: false,
    choices: ['ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'no-raw-packets', 'secure-dns', 'vscode-security'],
  },
  {
    key: 'airgapped',
    label: 'Air-gapped',
    description: 'Hardened with no network access.',
    caveat: 'No network access — extensions and package managers will not work.',
    experimental: false,
    choices: ['ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'no-raw-packets', 'secure-dns', 'vscode-security', 'network-none'],
  },
  {
    key: 'paranoid',
    label: 'Paranoid',
    description: 'Maximum security with air-gapped, read-only environment.',
    caveat: 'No network access or persistent storage — extensions and package managers will not work.',
    experimental: true,
    choices: ['readonly-os', 'ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'network-none', 'vscode-security'],
  },
  {
    key: 'network-restricted-analysis',
    label: 'Network Restricted Analysis',
    description: 'For web APIs, git, and package installs without packet crafting capabilities.',
    caveat: 'Packet-crafting tools will not work.',
    experimental: true,
    choices: ['ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'no-raw-packets', 'secure-dns'],
  },
  {
    key: 'ci-like-local-runner',
    label: 'CI-like Local Runner',
    description: 'Mirrors CI behavior locally with immutable file system.',
    caveat: 'Cache writes will not persist across runs.',
    experimental: true,
    choices: ['readonly-os', 'ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'secure-dns'],
  },
  {
    key: 'package-install-session',
    label: 'Package Install Session',
    description: 'Allows installing packages while keeping guardrails in place.',
    caveat: 'Omit drop-caps if installs fail unexpectedly.',
    experimental: true,
    choices: ['ephemeral-workspace', 'secure-tmp', 'no-new-privs', 'apparmor', 'secure-dns', 'vscode-security'],
  },
  {
    key: 'security-research-controlled-net',
    label: 'Security Research (Controlled Net)',
    description: 'For API testing and collectors without packet crafting capability.',
    caveat: 'Packet-crafting tools will not work.',
    experimental: true,
    choices: ['ephemeral-workspace', 'secure-tmp', 'drop-caps', 'no-new-privs', 'apparmor', 'no-raw-packets', 'secure-dns'],
  },
]

const PROFILE_BY_KEY = new Map(PROFILES.map((p) => [p.key, p]))

export function isProfileKey(value: string): value is ProfileKey {
  return PROFILE_BY_KEY.has(value as ProfileKey)
}

export function getProfile(key: string): ProfileDefinition | undefined {
  return PROFILE_BY_KEY.get(key as ProfileKey)
}

/** Expand one or more profile keys into a normalized, deduped hardening set. */
export function recipesToHardening(selected: string[]): HardeningKey[] {
  const choices: string[] = []
  for (const key of selected) {
    const profile = PROFILE_BY_KEY.get(key as ProfileKey)
    if (profile) choices.push(...profile.choices)
  }
  return normalizeHardening(choices).keys
}
