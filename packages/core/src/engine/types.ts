import type { CaptureResult } from './exec.js'

export type EngineName = 'docker' | 'podman' | 'orbstack' | 'apple-container' | 'lima'

export const ALL_ENGINES: readonly EngineName[] = [
  'docker',
  'podman',
  'orbstack',
  'apple-container',
  'lima',
] as const

/**
 * Capability keys correspond 1:1 with the kinds of hardening the translator can
 * request. The translator consults these to decide whether to emit a flag,
 * emit-with-warning, or drop it.
 */
export type CapabilityKey =
  | 'readOnlyRootfs'
  | 'tmpfs'
  | 'capDrop'
  | 'noNewPrivs'
  | 'apparmor'
  | 'seccomp'
  | 'networkNone'
  | 'sysctl'
  | 'dns'
  | 'memoryLimit'
  | 'cpuLimit'
  | 'userNamespaces'

export type CapSupport = 'supported' | 'caveated' | 'unsupported'

export interface Capability {
  support: CapSupport
  /** Human-readable advisory shown when caveated, or reason when unsupported. */
  note?: string
  /**
   * For a `caveated` security control: `false` means the flag is emitted but the
   * control may be silently inert (e.g. AppArmor under rootless Podman). `--strict`
   * treats these like a dropped control. Defaults to `true` (caveat is advisory only).
   */
  enforced?: boolean
}

export type EngineCapabilities = Record<CapabilityKey, Capability>

export interface DetectResult {
  available: boolean
  version?: string
  /** Why the engine is unavailable (binary missing, daemon down, etc.). */
  reason?: string
}

export interface BuildSpec {
  /** Absolute path to the generated Containerfile/Dockerfile. */
  containerfilePath: string
  /** Build context directory. */
  contextDir: string
  tag: string
  platform?: string
  buildArgs?: Record<string, string>
  noCache?: boolean
}

export interface RunSpec {
  image: string
  /** Container name (e.g. dcw-<env>). */
  name: string
  /** Labels applied to the container for store<->engine reconciliation. */
  labels?: Record<string, string>
  /** Hardening + misc flags produced by the translator, already engine-correct. */
  flags: string[]
  workdir?: string
  env?: Record<string, string>
  /** Run detached (true for `up`). */
  detach: boolean
  /** Optional entry command; defaults to the image default. */
  command?: string[]
}

export interface ExecSpec {
  container: string
  cmd: string[]
  interactive: boolean
  tty: boolean
  /** Run the command as this user inside the container (engine `-u`). */
  user?: string
  /** Extra environment variables to set for the command (engine `-e`). */
  env?: Record<string, string>
}

export interface ContainerInfo {
  id: string
  name: string
  image: string
  status: string
  labels: Record<string, string>
}

export interface PsFilter {
  label?: string
  all?: boolean
}

export interface LogsOptions {
  follow?: boolean
  tail?: number
}

export interface EngineDriver {
  readonly name: EngineName
  readonly displayName: string
  readonly capabilities: EngineCapabilities
  detect(): Promise<DetectResult>
  build(spec: BuildSpec): Promise<{ imageId: string }>
  run(spec: RunSpec): Promise<{ containerId: string }>
  exec(spec: ExecSpec): Promise<number>
  /** Like `exec`, but captures stdout/stderr and can feed stdin (never throws on non-zero). */
  execCapture(spec: ExecSpec, input?: string): Promise<CaptureResult>
  stop(id: string): Promise<void>
  rm(id: string, opts?: { force?: boolean }): Promise<void>
  ps(filter?: PsFilter): Promise<ContainerInfo[]>
  logs(id: string, opts?: LogsOptions): Promise<number>
  /** Run a throwaway container, capturing stdout (used to read in-image reports).
   *  `flags` are extra `run` flags (e.g. hardening) inserted before the image. */
  runOnce(image: string, cmd: string[], flags?: string[]): Promise<{ stdout: string; code: number }>
}
