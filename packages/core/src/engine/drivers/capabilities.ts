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

/**
 * Capability map for Docker-compatible engines (docker, orbstack).
 *
 * `--security-opt apparmor=...` is accepted by any Docker daemon, but only *applied*
 * where the kernel actually has the AppArmor LSM. On macOS/Windows these engines run
 * a Linux VM without it: `docker inspect` returns an empty `AppArmorProfile` and the
 * container has no `/proc/self/attr/current` (verified on OrbStack 29.4.0 / macOS).
 * Declaring it plainly `supported` let `--strict` pass on a control that does
 * nothing — precisely what `--strict` exists to catch. Podman and Lima already model
 * this with `enforced: false`.
 *
 * `hasApparmor` must come from the DAEMON, not the CLI host: with
 * `DOCKER_HOST=ssh://linux-box` a macOS client drives an AppArmor-capable daemon (and
 * the reverse is equally possible). Pass `undefined` when it has not been probed yet
 * — the default is fail-closed, since claiming enforcement we cannot verify is the
 * failure mode that matters here.
 */
export function dockerCaps(hasApparmor?: boolean): EngineCapabilities {
  if (hasApparmor === true) return caps()
  return caps({
    apparmor: {
      support: 'caveated',
      enforced: false,
      note:
        hasApparmor === false
          ? 'The Docker daemon does not report AppArmor support, so the profile flag is accepted but not enforced.'
          : 'AppArmor support could not be confirmed with the Docker daemon; treating the profile flag as unenforced.',
    },
  })
}

/** True when `docker info` reports the daemon has the AppArmor LSM available. */
export function daemonReportsApparmor(dockerInfoSecurityOptions: string): boolean {
  return /name=apparmor/i.test(dockerInfoSecurityOptions)
}
