import { EngineUnavailableError, EngineUnsupportedError, NoEngineError } from '../errors.js'
import { enginePlatformSupport, enginePreference, type HostInfo, type PlatformSupport } from './host.js'
import { createAllDrivers } from './registry.js'
import type { DetectResult, EngineCapabilities, EngineDriver, EngineName } from './types.js'

/** Combined platform + availability + capability view of one engine (for the compat table). */
export interface EngineStatus {
  name: EngineName
  displayName: string
  platform: PlatformSupport
  /** Detection result; only populated when platform-supported. */
  detect?: DetectResult
  capabilities: EngineCapabilities
  /** True for the engine auto-select would pick. */
  recommended: boolean
}

export interface SurveyOptions {
  host: HostInfo
  /** Inject drivers for testing; defaults to all real drivers. */
  drivers?: EngineDriver[]
  /** Skip detection probes (platform + capabilities only). */
  skipDetect?: boolean
}

/** Produce a full per-engine status table, ordered by host preference. */
export async function surveyEngines(opts: SurveyOptions): Promise<EngineStatus[]> {
  const drivers = opts.drivers ?? createAllDrivers()
  const byName = new Map(drivers.map((d) => [d.name, d]))
  const order = enginePreference(opts.host)
  const ordered = [
    ...order.map((n) => byName.get(n)).filter((d): d is EngineDriver => Boolean(d)),
    ...drivers.filter((d) => !order.includes(d.name)),
  ]

  // The recommended engine is the first platform-supported + available one in preference order.
  let recommendedName: EngineName | undefined

  const statuses: EngineStatus[] = []
  for (const driver of ordered) {
    const platform = enginePlatformSupport(driver.name, opts.host)
    let detect: DetectResult | undefined
    if (platform.supported && !opts.skipDetect) {
      detect = await driver.detect()
      if (detect.available && recommendedName === undefined && order.includes(driver.name)) {
        recommendedName = driver.name
      }
    }
    statuses.push({
      name: driver.name,
      displayName: driver.displayName,
      platform,
      detect,
      capabilities: driver.capabilities,
      recommended: false,
    })
  }

  for (const s of statuses) {
    s.recommended = s.name === recommendedName
  }
  return statuses
}

export interface ResolveOptions {
  /** Value of --engine / DCW_ENGINE; 'auto' or undefined means auto-detect. */
  requested?: string
  host: HostInfo
  drivers?: EngineDriver[]
}

export interface ResolveResult {
  driver: EngineDriver
  detect: DetectResult
  platform: PlatformSupport
}

/**
 * Resolve the engine to use. Honors an explicit request (validated against host
 * support + availability) or auto-selects the first available engine in the
 * host's preference order.
 */
export async function resolveEngine(opts: ResolveOptions): Promise<ResolveResult> {
  const drivers = opts.drivers ?? createAllDrivers()
  const byName = new Map(drivers.map((d) => [d.name, d]))
  const requested = opts.requested && opts.requested !== 'auto' ? (opts.requested as EngineName) : undefined

  if (requested) {
    const driver = byName.get(requested)
    if (!driver) {
      throw new EngineUnsupportedError(`Unknown engine '${requested}'.`)
    }
    const platform = enginePlatformSupport(requested, opts.host)
    if (!platform.supported) {
      throw new EngineUnsupportedError(`Engine '${requested}' is not supported on this host: ${platform.reason}`)
    }
    const detect = await driver.detect()
    if (!detect.available) {
      throw new EngineUnavailableError(
        `Engine '${requested}' is supported but not available: ${detect.reason ?? 'not detected.'}`,
      )
    }
    return { driver, detect, platform }
  }

  // Auto-detect: walk preference order, return the first available engine.
  const order = enginePreference(opts.host)
  const unavailable: string[] = []
  for (const name of order) {
    const driver = byName.get(name)
    if (!driver) continue
    const platform = enginePlatformSupport(name, opts.host)
    if (!platform.supported) continue
    const detect = await driver.detect()
    if (detect.available) {
      return { driver, detect, platform }
    }
    unavailable.push(`${driver.displayName} (${detect.reason ?? 'not detected'})`)
  }

  throw new NoEngineError(
    `No supported container engine is available. Tried: ${unavailable.join(', ') || 'none'}. ` +
      'Install or start Docker, Podman, OrbStack, Lima, or Apple Containers.',
  )
}
