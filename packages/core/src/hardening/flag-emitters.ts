import type { EngineName } from '../engine/types.js'
import type { HardeningEffect } from './effects.js'

/**
 * Render an engine-neutral effect into concrete `run` flags for a given engine.
 * Called only after the translator has confirmed the engine supports (or
 * caveat-supports) the effect, so this never needs to gate on capabilities.
 */
export function emitFlags(effect: HardeningEffect, _engine: EngineName): string[] {
  switch (effect.kind) {
    case 'readonly-rootfs':
      return ['--read-only']
    case 'tmpfs':
      return ['--tmpfs', `${effect.target}:${effect.opts}`]
    case 'ephemeral-workspace':
      return ['--tmpfs', '/workspace:rw,nosuid,nodev,size=2g,uid=1000,gid=1000,mode=1777']
    case 'drop-cap':
      return [`--cap-drop=${effect.cap}`]
    case 'no-new-privs':
      return ['--security-opt', 'no-new-privileges:true']
    case 'apparmor':
      return ['--security-opt', `apparmor=${effect.profile}`]
    case 'network-none':
      return ['--network=none']
    case 'sysctl':
      return ['--sysctl', `${effect.key}=${effect.value}`]
    case 'dns':
      return effect.servers.flatMap((s) => ['--dns', s])
    case 'resources':
      return ['--memory', effect.memory, '--cpus', effect.cpus]
    case 'noop':
      return []
  }
}

/** A tmpfs flag string that maps host uids (needs userns remapping under rootless podman). */
export function flagNeedsUserns(flag: string): boolean {
  return /uid=\d+/.test(flag)
}
