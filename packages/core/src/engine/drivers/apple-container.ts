import { EngineDnsError } from '../../errors.js'
import { appleBuildDnsMessage, probeAppleBuildDns } from '../dns-preflight.js'
import { capture } from '../exec.js'
import type {
  BuildSpec,
  ContainerInfo,
  DetectResult,
  EngineCapabilities,
  EngineName,
  PsFilter,
} from '../types.js'
import { fullCaps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/**
 * Apple Containers (`container` CLI): each container runs in its own lightweight VM.
 *
 * Verified against `container` CLI 1.0.0: `--cap-drop` IS exposed and genuinely
 * enforced (--cap-drop ALL takes CapEff from 00000000a80425fb to 0000000000000000),
 * so it is declared supported rather than discarded. `--read-only` is enforced too,
 * but is unusable here without the uid-mapped tmpfs mounts it is always paired with,
 * so it stays unsupported (see below). Linux MAC primitives (AppArmor, seccomp,
 * sysctl, no-new-privileges) and `--network=none` are not honored — those stay
 * unsupported so the translator drops them with an explanatory warning rather than
 * emitting flags that do nothing.
 */
export class AppleContainerDriver extends CliDriver {
  readonly name: EngineName = 'apple-container'
  readonly displayName = 'Apple Containers'
  readonly capabilities: EngineCapabilities = fullCaps({
    // Emitting --read-only WITHOUT the writable tmpfs mounts that `readonly-os`
    // pairs with it would leave the container unable to write $HOME at all, so
    // these two stay coupled: tmpfs is unsupported here (below), therefore
    // read-only rootfs must be too.
    readOnlyRootfs: {
      support: 'unsupported',
      note: 'Read-only rootfs needs the paired writable tmpfs mounts, which this CLI cannot express (see tmpfs); enabling it alone would leave $HOME unwritable.',
    },
    tmpfs: {
      support: 'unsupported',
      note: 'The container CLI takes the whole --tmpfs argument as a literal mount path, so Docker-style options are not parsed. Emitting a bare path would drop uid/gid/mode, mounting root-owned empty tmpfs over /home/vscode/.local and .ssh — hiding baked tools and breaking `dcw attach`.',
    },
    capDrop: { support: 'supported' },
    noNewPrivs: { support: 'unsupported', note: 'no-new-privileges is not exposed; relies on VM isolation.' },
    apparmor: { support: 'unsupported', note: 'No AppArmor; relies on VM isolation.' },
    seccomp: { support: 'unsupported', note: 'No seccomp profile control; relies on VM isolation.' },
    networkNone: {
      support: 'unsupported',
      note: 'The container CLI does not honor Docker --network=none; air-gap is not enforced.',
    },
    sysctl: { support: 'unsupported', note: 'sysctl tuning is not exposed.' },
    // `--dns` IS honored by `container run` (verified: a run with --dns 1.1.1.1
    // resolves where the default gateway resolver does not), so `secure-dns` is a
    // real control here and must not be dropped. The caveat is the BUILD path:
    // `container build --dns` parses and then does nothing, because build steps
    // execute inside the shared `buildkit` container and inherit ITS resolvers.
    dns: {
      support: 'caveated',
      note: '`--dns` is honored by `container run`, but NOT by `container build`: build steps execute inside the shared `buildkit` container and inherit its resolvers, which are fixed by `container builder start --dns <ip>`.',
    },
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

  /**
   * Build, and translate the one failure users cannot debug on their own.
   *
   * A builder with no DNS turns every `RUN apt-get update` into a wall of apt
   * output ending in `Temporary failure resolving 'deb.debian.org'` — which looks
   * like a broken Containerfile and is actually a host port-53 conflict. The probe
   * runs only after the build has already failed, so healthy builds pay nothing,
   * and it fails open: no confident diagnosis means the original error survives.
   */
  override async build(spec: BuildSpec): Promise<{ imageId: string }> {
    try {
      return await super.build(spec)
    } catch (err) {
      const diag = await probeAppleBuildDns(this.bin).catch(() => null)
      if (diag?.blocked) throw new EngineDnsError(appleBuildDnsMessage(diag))
      throw err
    }
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
    // `container list` has no --filter flag, so the label filter is applied here.
    return parseAppleList(res.stdout, filter.label)
  }
}

/**
 * Parse `container list --format json`.
 *
 * Apple's schema is NOT docker's flat `{ID,Names,Image,Status,Labels}`: each row is
 * `{ id, status: { state }, configuration: { id, labels, image: { reference } } }`.
 * Reading docker's field names off it yields `name: ''`, `status: '[object Object]'`
 * and no labels — which made `dcw ls` report a running container as `absent`, broke
 * the presence guard in `stop`/`rm` (every env matched the unrelated `buildkit`
 * container), and left environments unremovable. Apple has no separate name: the
 * `--name` given at run time IS the container id.
 */
export function parseAppleList(stdout: string, label?: string): ContainerInfo[] {
  let rows: unknown
  try {
    rows = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(rows)) return []

  const out: ContainerInfo[] = []
  for (const row of rows as Array<Record<string, unknown> | null>) {
    // A single malformed row must not take down `ls`, `stop`, `rm` and attach
    // discovery — skip it the way parsePsJson skips a bad NDJSON line.
    if (!row || typeof row !== 'object') continue
    const cfg = (row.configuration ?? {}) as Record<string, unknown>
    const status = (row.status ?? {}) as Record<string, unknown>
    const id = String(row.id ?? cfg.id ?? '')
    if (!id) continue

    const rawLabels = (cfg.labels ?? {}) as Record<string, unknown>
    const labels: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawLabels)) labels[k] = String(v)

    const image = (cfg.image ?? {}) as Record<string, unknown>

    out.push({
      id,
      // Apple's `--name` sets the container id; there is no distinct name field.
      name: id,
      image: String(image.reference ?? ''),
      status: String(status.state ?? ''),
      labels,
    })
  }

  if (!label) return out
  const eq = label.indexOf('=')
  if (eq < 0) return out.filter((c) => label in c.labels)
  const key = label.slice(0, eq)
  const value = label.slice(eq + 1)
  return out.filter((c) => c.labels[key] === value)
}
