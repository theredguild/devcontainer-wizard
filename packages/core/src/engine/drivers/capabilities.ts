import type { Capability, CapabilityKey, EngineCapabilities } from '../types.js'

export const CAPABILITY_KEYS: readonly CapabilityKey[] = [
  'readOnlyRootfs',
  'tmpfs',
  'capDrop',
  'noNewPrivs',
  'apparmor',
  'seccomp',
  'networkNone',
  'sysctl',
  'dns',
  'memoryLimit',
  'cpuLimit',
  'userNamespaces',
] as const

/**
 * Build a capability map, defaulting every key to 'supported' unless overridden.
 * Use ONLY for engines that are genuinely Docker-flag-compatible (docker, orbstack,
 * and near-Docker podman/lima): a new capability key would default to 'supported',
 * which is the safe assumption *only* for those engines.
 */
export function caps(overrides: Partial<Record<CapabilityKey, Capability>> = {}): EngineCapabilities {
  const out = {} as EngineCapabilities
  for (const key of CAPABILITY_KEYS) {
    out[key] = overrides[key] ?? { support: 'supported' }
  }
  return out
}

/**
 * Build a capability map where EVERY key must be declared explicitly. Use for
 * non-Docker engines (e.g. apple-container) so adding a new CapabilityKey is a
 * compile error until the driver states its stance — fail-closed, not fail-open.
 */
export function fullCaps(map: Record<CapabilityKey, Capability>): EngineCapabilities {
  return map
}
