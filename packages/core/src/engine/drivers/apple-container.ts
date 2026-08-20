import { capture } from '../exec.js'
import type {
  ContainerInfo,
  DetectResult,
  EngineCapabilities,
  EngineName,
  PsFilter,
} from '../types.js'
import { fullCaps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/**
 * Apple Containers (`container` CLI): each container runs in its own lightweight
 * VM. Linux MAC primitives (capabilities, AppArmor, seccomp, sysctl) and
 * read-only rootfs control are not user-exposed — isolation comes from the VM
 * boundary instead. Those capabilities are marked unsupported so the translator
 * drops them with an explanatory warning rather than emitting broken flags.
 */
export class AppleContainerDriver extends CliDriver {
  readonly name: EngineName = 'apple-container'
  readonly displayName = 'Apple Containers'
  readonly capabilities: EngineCapabilities = fullCaps({
    readOnlyRootfs: { support: 'unsupported', note: 'Read-only rootfs control is not exposed by the container CLI.' },
    tmpfs: { support: 'unsupported', note: 'tmpfs mount options are not supported.' },
    capDrop: { support: 'unsupported', note: 'No Linux capability management; isolation is provided by the per-container VM.' },
    noNewPrivs: { support: 'unsupported', note: 'no-new-privileges is not exposed; relies on VM isolation.' },
    apparmor: { support: 'unsupported', note: 'No AppArmor; relies on VM isolation.' },
    seccomp: { support: 'unsupported', note: 'No seccomp profile control; relies on VM isolation.' },
    networkNone: {
      support: 'unsupported',
      note: 'The container CLI does not honor Docker --network=none; air-gap is not enforced.',
    },
    sysctl: { support: 'unsupported', note: 'sysctl tuning is not exposed.' },
    dns: { support: 'caveated', note: 'DNS configuration support is limited.' },
    memoryLimit: { support: 'caveated', note: 'Memory limits use a different syntax and granularity.' },
    cpuLimit: { support: 'caveated', note: 'CPU limits use a different syntax and granularity.' },
    userNamespaces: { support: 'unsupported', note: 'User-namespace remapping is not applicable (VM-isolated).' },
  })

  constructor() {
    super({
      bin: 'container',
      verbs: { rm: 'delete', ps: 'list' },
    })
  }

  override async detect(): Promise<DetectResult> {
    const ver = await capture('container', ['--version'])
    if (ver.spawnError) {
      return { available: false, reason: '`container` CLI not found on PATH.' }
    }
    const version = ver.stdout.trim().split('\n')[0]
    const status = await capture('container', ['list'])
    if (status.code !== 0) {
      return { available: false, version, reason: status.stderr.trim() || 'Apple Containers service is not running.' }
    }
    return { available: true, version }
  }

  override async ps(filter: PsFilter = {}): Promise<ContainerInfo[]> {
    const args = ['list', '--format', 'json']
    if (filter.all ?? true) args.push('--all')
    const res = await capture('container', args)
    if (res.code !== 0) return []
    try {
      const rows = JSON.parse(res.stdout) as Array<Record<string, unknown>>
      if (!Array.isArray(rows)) return []
      return rows.map((row) => ({
        id: String(row.id ?? row.ID ?? ''),
        name: String(row.name ?? row.Name ?? ''),
        image: String(row.image ?? row.Image ?? ''),
        status: String(row.status ?? row.state ?? row.Status ?? ''),
        labels: (row.labels && typeof row.labels === 'object'
          ? Object.fromEntries(Object.entries(row.labels as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
          : {}),
      }))
    } catch {
      return []
    }
  }
}
