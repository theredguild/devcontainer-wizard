/**
 * Catalog of canonical hardening options. The translator maps each key to
 * engine-neutral effects (see `hardening/effects.ts`); this module is the
 * single source of truth for the key vocabulary + UI metadata.
 */

export type HardeningCategory = 'filesystem' | 'container' | 'network' | 'resources' | 'application'

export interface HardeningOption {
  key: HardeningKey
  label: string
  description: string
  category: HardeningCategory
}

export type HardeningKey =
  | 'readonly-os'
  | 'ephemeral-workspace'
  | 'secure-tmp'
  | 'drop-caps'
  | 'no-new-privs'
  | 'apparmor'
  | 'network-none'
  | 'disable-ipv6'
  | 'secure-dns'
  | 'no-raw-packets'
  | 'resource-limits-light'
  | 'resource-limits-standard'
  | 'resource-limits-heavy'
  | 'vscode-security'

export const HARDENING_OPTIONS: HardeningOption[] = [
  { key: 'readonly-os', label: 'Read-only root filesystem', description: 'Mount the rootfs read-only with writable tmpfs for caches/tmp.', category: 'filesystem' },
  { key: 'ephemeral-workspace', label: 'Ephemeral workspace', description: 'Mount /workspace as tmpfs; nothing persists.', category: 'filesystem' },
  { key: 'secure-tmp', label: 'Secure /tmp', description: 'tmpfs /tmp and /var/tmp with noexec,nosuid.', category: 'filesystem' },
  { key: 'drop-caps', label: 'Drop all capabilities', description: 'Drop all Linux capabilities (--cap-drop=ALL).', category: 'container' },
  { key: 'no-new-privs', label: 'No new privileges', description: 'Prevent privilege escalation (no-new-privileges).', category: 'container' },
  { key: 'apparmor', label: 'AppArmor profile', description: 'Apply the docker-default AppArmor profile.', category: 'container' },
  { key: 'network-none', label: 'No network', description: 'Fully air-gap the container (--network=none).', category: 'network' },
  { key: 'disable-ipv6', label: 'Disable IPv6', description: 'Disable IPv6 via sysctls.', category: 'network' },
  { key: 'secure-dns', label: 'Secure DNS', description: 'Force Cloudflare resolvers (1.1.1.1 / 1.0.0.1).', category: 'network' },
  { key: 'no-raw-packets', label: 'No raw packets', description: 'Drop NET_RAW so packet-crafting tools cannot run.', category: 'network' },
  { key: 'resource-limits-light', label: 'Resource limits: light', description: '512m memory, 2 CPUs.', category: 'resources' },
  { key: 'resource-limits-standard', label: 'Resource limits: standard', description: '2g memory, 4 CPUs.', category: 'resources' },
  { key: 'resource-limits-heavy', label: 'Resource limits: heavy', description: '4g memory, 8 CPUs.', category: 'resources' },
  { key: 'vscode-security', label: 'Editor hardening (no-op)', description: 'No effect in shell-first mode; kept for profile compatibility.', category: 'application' },
]

export const HARDENING_KEYS: HardeningKey[] = HARDENING_OPTIONS.map((o) => o.key)

export function isHardeningKey(value: string): value is HardeningKey {
  return HARDENING_KEYS.includes(value as HardeningKey)
}
