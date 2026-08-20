import { caps } from '../../src/engine/drivers/capabilities.js'
import type { CaptureResult } from '../../src/engine/exec.js'
import type {
  BuildSpec,
  ContainerInfo,
  DetectResult,
  EngineCapabilities,
  EngineDriver,
  EngineName,
  ExecSpec,
  PsFilter,
  RunSpec,
} from '../../src/engine/types.js'

export interface FakeDriverOptions {
  name: EngineName
  displayName?: string
  detect?: DetectResult
  capabilities?: EngineCapabilities
  /** Result the report probe (`runOnce`) returns; defaults to a clean read. */
  runOnceResult?: { stdout: string; code: number }
}

/** In-memory EngineDriver that records the specs it receives — no real daemon. */
export class FakeDriver implements EngineDriver {
  readonly name: EngineName
  readonly displayName: string
  readonly capabilities: EngineCapabilities
  private readonly detectResult: DetectResult
  private readonly runOnceResult: { stdout: string; code: number }

  builds: BuildSpec[] = []
  runs: RunSpec[] = []
  execs: ExecSpec[] = []
  stops: string[] = []
  rms: Array<{ id: string; force?: boolean }> = []

  constructor(opts: FakeDriverOptions) {
    this.name = opts.name
    this.displayName = opts.displayName ?? opts.name
    this.capabilities = opts.capabilities ?? caps()
    this.detectResult = opts.detect ?? { available: true, version: 'fake-1.0' }
    this.runOnceResult = opts.runOnceResult ?? { stdout: '', code: 0 }
  }

  async detect(): Promise<DetectResult> {
    return this.detectResult
  }

  async build(spec: BuildSpec): Promise<{ imageId: string }> {
    this.builds.push(spec)
    return { imageId: `sha256:fake-${spec.tag}` }
  }

  async run(spec: RunSpec): Promise<{ containerId: string }> {
    this.runs.push(spec)
    return { containerId: `cid-${spec.name}` }
  }

  async exec(spec: ExecSpec): Promise<number> {
    this.execs.push(spec)
    return 0
  }

  async execCapture(spec: ExecSpec): Promise<CaptureResult> {
    this.execs.push(spec)
    return { code: 0, stdout: '', stderr: '', spawnError: false }
  }

  async stop(id: string): Promise<void> {
    this.stops.push(id)
  }

  async rm(id: string, opts: { force?: boolean } = {}): Promise<void> {
    this.rms.push({ id, force: opts.force })
  }

  async ps(_filter?: PsFilter): Promise<ContainerInfo[]> {
    return []
  }

  async logs(): Promise<number> {
    return 0
  }

  runOnces: Array<{ image: string; cmd: string[]; flags: string[] }> = []

  async runOnce(image: string, cmd: string[], flags: string[] = []): Promise<{ stdout: string; code: number }> {
    this.runOnces.push({ image, cmd, flags })
    return this.runOnceResult
  }
}
