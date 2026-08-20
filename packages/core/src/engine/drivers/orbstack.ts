import { capture } from '../exec.js'
import type { DetectResult, EngineCapabilities, EngineName } from '../types.js'
import { caps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/**
 * OrbStack speaks the Docker CLI, so capabilities match Docker. It is only
 * considered "available" when the active Docker context is actually OrbStack
 * (otherwise the plain Docker driver applies).
 */
export class OrbstackDriver extends CliDriver {
  readonly name: EngineName = 'orbstack'
  readonly displayName = 'OrbStack'
  readonly capabilities: EngineCapabilities = caps()

  constructor() {
    super({ bin: 'docker' })
  }

  override async detect(): Promise<DetectResult> {
    const base = await super.detect()
    if (!base.available) return base

    // Confirm the active Docker endpoint is OrbStack.
    const ctx = await capture('docker', ['context', 'show'])
    if (ctx.code === 0 && ctx.stdout.trim().toLowerCase().includes('orbstack')) {
      return base
    }
    const info = await capture('docker', ['info', '--format', '{{json .}}'])
    if (info.code === 0 && /orbstack/i.test(info.stdout)) {
      return base
    }
    return {
      available: false,
      version: base.version,
      reason: 'Docker is running but the active context is not OrbStack.',
    }
  }
}
