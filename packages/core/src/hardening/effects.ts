import type { HardeningKey } from '../domain/hardening.js'
import type { CapabilityKey } from '../engine/types.js'

/**
 * Engine-neutral hardening intents. Hardening keys expand into these; the
 * translator then renders engine-correct flags (or drops them) based on each
 * engine's capability map.
 */
export type HardeningEffect =
  | { kind: 'readonly-rootfs' }
  | { kind: 'tmpfs'; target: string; opts: string }
  | { kind: 'ephemeral-workspace' }
  | { kind: 'drop-cap'; cap: 'ALL' | 'NET_RAW' }
  | { kind: 'no-new-privs' }
  | { kind: 'apparmor'; profile: string }
  | { kind: 'network-none' }
  | { kind: 'sysctl'; key: string; value: string }
  | { kind: 'dns'; servers: string[] }
  | { kind: 'resources'; memory: string; cpus: string }
  | { kind: 'noop'; source: HardeningKey; reason: string }

/** The capability each effect depends on (null = always applicable, e.g. noop). */
export function capabilityFor(effect: HardeningEffect): CapabilityKey | null {
  switch (effect.kind) {
    case 'readonly-rootfs':
      return 'readOnlyRootfs'
    case 'tmpfs':
    case 'ephemeral-workspace':
      return 'tmpfs'
    case 'drop-cap':
      return 'capDrop'
    case 'no-new-privs':
      return 'noNewPrivs'
    case 'apparmor':
      return 'apparmor'
    case 'network-none':
      return 'networkNone'
    case 'sysctl':
      return 'sysctl'
    case 'dns':
      return 'dns'
    case 'resources':
      return 'memoryLimit'
    case 'noop':
      return null
  }
}

// Writable tmpfs mounts paired with a read-only rootfs (the VS Code server mounts
// from the original devcontainer config are intentionally dropped — shell-first).
const READONLY_TMPFS: Array<{ target: string; opts: string }> = [
  { target: '/tmp', opts: 'rw,noexec,nosuid,size=1g' },
  { target: '/var/tmp', opts: 'rw,noexec,nosuid,size=1g' },
  { target: '/var/log', opts: 'rw,noexec,nosuid,size=256m' },
  { target: '/run', opts: 'rw,noexec,nosuid,size=256m' },
  { target: '/home/vscode/.cache', opts: 'rw,noexec,nosuid,size=1g,uid=1000,gid=1000' },
  { target: '/home/vscode/.config', opts: 'rw,noexec,nosuid,size=512m,uid=1000,gid=1000' },
  { target: '/home/vscode/.local', opts: 'rw,noexec,nosuid,size=1g,uid=1000,gid=1000' },
  { target: '/home/vscode/.gnupg', opts: 'rw,noexec,nosuid,size=64m,uid=1000,gid=1000' },
  // Writable ~/.ssh so `dcw attach` can drop a runtime host key + authorized_keys
  // (the baked sshd config lives at /etc/ssh/sshd_config.dcw, not under here).
  { target: '/home/vscode/.ssh', opts: 'rw,nosuid,size=16m,uid=1000,gid=1000,mode=0700' },
]

/** Parse a tmpfs `size=` option into bytes for comparison (Infinity if absent). */
export function tmpfsSizeBytes(opts: string): number {
  // Match the whole `size=<n><unit>` token rather than capture groups: index 0 of
  // a RegExpExecArray is typed `string`, so splitting the token by hand avoids an
  // optional-group fallback that no input could ever take.
  const m = /size=\d+[kmg]?/i.exec(opts)
  if (!m) return Number.POSITIVE_INFINITY
  const token = m[0].slice('size='.length).toLowerCase()
  const suffixed = /[kmg]$/.test(token)
  const unit = suffixed ? token.slice(-1) : ''
  const digits = suffixed ? token.slice(0, -1) : token
  const mult = unit === 'g' ? 1024 ** 3 : unit === 'm' ? 1024 ** 2 : unit === 'k' ? 1024 : 1
  return Number(digits) * mult
}

/**
 * Collapse duplicate tmpfs effects targeting the same mount point (e.g. both
 * `readonly-os` and `secure-tmp` mount /tmp). Keeping two `--tmpfs /tmp` specs
 * is non-deterministic — which size wins is engine-dependent — so we keep the
 * most restrictive (smallest) one at the position of its first occurrence.
 */
function dedupeTmpfs(effects: HardeningEffect[]): HardeningEffect[] {
  const slotForTarget = new Map<string, number>()
  const out: HardeningEffect[] = []
  for (const effect of effects) {
    if (effect.kind !== 'tmpfs') {
      out.push(effect)
      continue
    }
    const slot = slotForTarget.get(effect.target)
    if (slot === undefined) {
      slotForTarget.set(effect.target, out.length)
      out.push(effect)
    } else {
      const prev = out[slot] as Extract<HardeningEffect, { kind: 'tmpfs' }>
      if (tmpfsSizeBytes(effect.opts) < tmpfsSizeBytes(prev.opts)) out[slot] = effect
    }
  }
  return out
}

const RESOURCE_TIERS: Record<string, { memory: string; cpus: string }> = {
  'resource-limits-light': { memory: '512m', cpus: '2' },
  'resource-limits-standard': { memory: '2g', cpus: '4' },
  'resource-limits-heavy': { memory: '4g', cpus: '8' },
}

/**
 * Expand normalized hardening keys into engine-neutral effects, honoring the
 * mutual-exclusions the original generator encoded (drop-caps ⊇ no-raw-packets;
 * network-none supersedes disable-ipv6).
 */
export function hardeningToEffects(keys: HardeningKey[]): HardeningEffect[] {
  const set = new Set(keys)
  const effects: HardeningEffect[] = []

  if (set.has('readonly-os')) {
    effects.push({ kind: 'readonly-rootfs' })
    for (const m of READONLY_TMPFS) effects.push({ kind: 'tmpfs', target: m.target, opts: m.opts })
  }

  if (set.has('ephemeral-workspace')) {
    effects.push({ kind: 'ephemeral-workspace' })
  }

  if (set.has('secure-tmp')) {
    effects.push({ kind: 'tmpfs', target: '/tmp', opts: 'rw,noexec,nosuid,size=512m' })
    effects.push({ kind: 'tmpfs', target: '/var/tmp', opts: 'rw,noexec,nosuid,size=512m' })
  }

  // Capability dropping: ALL subsumes NET_RAW, so only emit one.
  if (set.has('drop-caps')) {
    effects.push({ kind: 'drop-cap', cap: 'ALL' })
  } else if (set.has('no-raw-packets')) {
    effects.push({ kind: 'drop-cap', cap: 'NET_RAW' })
  }

  if (set.has('no-new-privs')) effects.push({ kind: 'no-new-privs' })
  if (set.has('apparmor')) effects.push({ kind: 'apparmor', profile: 'docker-default' })

  // Networking: full air-gap supersedes IPv6 tuning.
  if (set.has('network-none')) {
    effects.push({ kind: 'network-none' })
  } else if (set.has('disable-ipv6')) {
    effects.push({ kind: 'sysctl', key: 'net.ipv6.conf.all.disable_ipv6', value: '1' })
    effects.push({ kind: 'sysctl', key: 'net.ipv6.conf.default.disable_ipv6', value: '1' })
  }

  if (set.has('secure-dns')) {
    effects.push({ kind: 'dns', servers: ['1.1.1.1', '1.0.0.1'] })
  }

  for (const tier of Object.keys(RESOURCE_TIERS)) {
    if (set.has(tier as HardeningKey)) {
      const t = RESOURCE_TIERS[tier]!
      effects.push({ kind: 'resources', memory: t.memory, cpus: t.cpus })
    }
  }

  if (set.has('vscode-security')) {
    effects.push({
      kind: 'noop',
      source: 'vscode-security',
      reason: 'Editor hardening has no effect in shell-first mode (no devcontainer/VS Code integration).',
    })
  }

  return dedupeTmpfs(effects)
}
