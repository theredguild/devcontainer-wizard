import { DcwError } from '../../errors.js'
import { capture, inherit, type CaptureResult } from '../exec.js'
import type {
  BuildSpec,
  ContainerInfo,
  DetectResult,
  EngineCapabilities,
  EngineDriver,
  EngineName,
  ExecSpec,
  LogsOptions,
  PsFilter,
  RunSpec,
} from '../types.js'

/** Subcommand verbs that differ between docker-like CLIs (Apple `container` renames some). */
export interface CliVerbs {
  build: string
  run: string
  exec: string
  stop: string
  rm: string
  ps: string
  logs: string
}

const DEFAULT_VERBS: CliVerbs = {
  build: 'build',
  run: 'run',
  exec: 'exec',
  stop: 'stop',
  rm: 'rm',
  ps: 'ps',
  logs: 'logs',
}

export interface CliConfig {
  bin: string
  /** Subcommand prefix inserted before every verb (e.g. ['nerdctl'] for `lima nerdctl ...`). */
  prefix?: string[]
  /** Binary used for the version probe (defaults to `bin`). */
  versionBin?: string
  versionArgs?: string[]
  verbs?: Partial<CliVerbs>
}

/** Shared implementation for docker-compatible CLIs (docker, podman, orbstack, nerdctl/lima). */
export abstract class CliDriver implements EngineDriver {
  abstract readonly name: EngineName
  abstract readonly displayName: string
  abstract readonly capabilities: EngineCapabilities

  protected readonly cfg: CliConfig
  protected readonly verbs: CliVerbs

  constructor(cfg: CliConfig) {
    this.cfg = cfg
    this.verbs = { ...DEFAULT_VERBS, ...cfg.verbs }
  }

  /** Compose full argv: prefix + rest. */
  protected argv(...rest: string[]): string[] {
    return [...(this.cfg.prefix ?? []), ...rest]
  }

  protected get bin(): string {
    return this.cfg.bin
  }

  protected fail(action: string, stderr: string): never {
    const detail = stderr.trim()
    throw new DcwError(`${this.displayName} ${action} failed${detail ? `: ${detail}` : '.'}`)
  }

  async detect(): Promise<DetectResult> {
    const versionBin = this.cfg.versionBin ?? this.cfg.bin
    const versionArgs = this.cfg.versionArgs ?? ['--version']
    const ver = await capture(versionBin, versionArgs)
    if (ver.spawnError) {
      return { available: false, reason: `${versionBin} not found on PATH.` }
    }
    const version = ver.stdout.trim().split('\n')[0]
    // Probe daemon/runtime readiness.
    const info = await capture(this.bin, this.argv('info'))
    if (info.code !== 0) {
      return { available: false, version, reason: info.stderr.trim() || `${this.displayName} runtime is not ready.` }
    }
    return { available: true, version }
  }

  async build(spec: BuildSpec): Promise<{ imageId: string }> {
    const args = this.argv(this.verbs.build, '-f', spec.containerfilePath, '-t', spec.tag)
    if (spec.platform) args.push('--platform', spec.platform)
    if (spec.noCache) args.push('--no-cache')
    for (const [k, v] of Object.entries(spec.buildArgs ?? {})) {
      args.push('--build-arg', `${k}=${v}`)
    }
    args.push(spec.contextDir)

    const code = await inherit(this.bin, args)
    if (code !== 0) throw new DcwError(`${this.displayName} build failed (exit ${code}).`)

    const inspect = await capture(this.bin, this.argv('image', 'inspect', spec.tag, '--format', '{{.Id}}'))
    return { imageId: inspect.code === 0 ? inspect.stdout.trim() : spec.tag }
  }

  async run(spec: RunSpec): Promise<{ containerId: string }> {
    const args = this.argv(this.verbs.run)
    if (spec.detach) args.push('-d')
    args.push('--name', spec.name)
    for (const [k, v] of Object.entries(spec.labels ?? {})) {
      args.push('--label', `${k}=${v}`)
    }
    args.push(...spec.flags)
    if (spec.workdir) args.push('-w', spec.workdir)
    for (const [k, v] of Object.entries(spec.env ?? {})) {
      args.push('-e', `${k}=${v}`)
    }
    args.push(spec.image)
    if (spec.command?.length) args.push(...spec.command)

    const res = await capture(this.bin, args)
    if (res.code !== 0) this.fail('run', res.stderr)
    // `slice(-1).join('')` is the last line (or '' for empty output) with no
    // `pop() ?? ''` arm that no input can reach.
    return { containerId: res.stdout.trim().split('\n').slice(-1).join('') }
  }

  protected execArgv(spec: ExecSpec): string[] {
    const args = this.argv(this.verbs.exec)
    if (spec.interactive) args.push('-i')
    if (spec.tty) args.push('-t')
    if (spec.user) args.push('--user', spec.user)
    // Pass `-e NAME` value-less: the engine inherits the value from our process
    // environment (see execEnv) so secrets never appear in argv / the host `ps`.
    for (const k of Object.keys(spec.env ?? {})) {
      args.push('-e', k)
    }
    args.push(spec.container, ...spec.cmd)
    return args
  }

  /** Merge the exec env vars into our process env so `-e NAME` can inherit them. */
  private execEnv(spec: ExecSpec): NodeJS.ProcessEnv | undefined {
    if (!spec.env || Object.keys(spec.env).length === 0) return undefined
    return { ...process.env, ...spec.env }
  }

  async exec(spec: ExecSpec): Promise<number> {
    return inherit(this.bin, this.execArgv(spec), { env: this.execEnv(spec) })
  }

  async execCapture(spec: ExecSpec, input?: string): Promise<CaptureResult> {
    const env = this.execEnv(spec)
    return capture(this.bin, this.execArgv(spec), {
      ...(input !== undefined ? { input } : {}),
      ...(env ? { env } : {}),
    })
  }

  async stop(id: string): Promise<void> {
    const res = await capture(this.bin, this.argv(this.verbs.stop, id))
    if (res.code !== 0) this.fail('stop', res.stderr)
  }

  async rm(id: string, opts: { force?: boolean } = {}): Promise<void> {
    const args = this.argv(this.verbs.rm)
    if (opts.force) args.push('-f')
    args.push(id)
    const res = await capture(this.bin, args)
    if (res.code !== 0) this.fail('rm', res.stderr)
  }

  async ps(filter: PsFilter = {}): Promise<ContainerInfo[]> {
    const args = this.argv(this.verbs.ps)
    if (filter.all ?? true) args.push('-a')
    if (filter.label) args.push('--filter', `label=${filter.label}`)
    args.push('--format', '{{json .}}')
    const res = await capture(this.bin, args)
    if (res.code !== 0) return []
    return parsePsJson(res.stdout)
  }

  async runOnce(image: string, cmd: string[], flags: string[] = []): Promise<{ stdout: string; code: number }> {
    const res = await capture(this.bin, this.argv(this.verbs.run, '--rm', ...flags, image, ...cmd))
    return { stdout: res.stdout, code: res.code }
  }

  async logs(id: string, opts: LogsOptions = {}): Promise<number> {
    const args = this.argv(this.verbs.logs)
    if (opts.follow) args.push('-f')
    if (opts.tail !== undefined) args.push('--tail', String(opts.tail))
    args.push(id)
    return inherit(this.bin, args)
  }
}

/** Parse `--format '{{json .}}'` NDJSON output from docker/podman/nerdctl `ps`. */
export function parsePsJson(stdout: string): ContainerInfo[] {
  const out: ContainerInfo[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>
      out.push({
        id: String(row.ID ?? row.Id ?? ''),
        name: String(row.Names ?? row.Name ?? ''),
        image: String(row.Image ?? ''),
        status: String(row.Status ?? row.State ?? ''),
        labels: parseLabels(row.Labels),
      })
    } catch {
      // skip malformed lines
    }
  }
  return out
}

function parseLabels(value: unknown): Record<string, string> {
  const labels: Record<string, string> = {}
  if (typeof value === 'string') {
    for (const pair of value.split(',')) {
      const idx = pair.indexOf('=')
      if (idx > 0) labels[pair.slice(0, idx)] = pair.slice(idx + 1)
    }
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      labels[k] = String(v)
    }
  }
  return labels
}
