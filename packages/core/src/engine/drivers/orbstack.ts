import { capture } from '../exec.js'
import type { DetectResult, EngineCapabilities, EngineName } from '../types.js'
import { daemonReportsApparmor, dockerCaps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/**
 * OrbStack speaks the Docker CLI, so capabilities match Docker. It is only
 * considered "available" when the active Docker context is actually OrbStack
 * (otherwise the plain Docker driver applies).
 */
export class OrbstackDriver extends CliDriver {
  readonly name: EngineName = 'orbstack'
  readonly displayName = 'OrbStack'
  capabilities: EngineCapabilities = dockerCaps()

  constructor() {
    super({ bin: 'docker' })
  }

  /** Ask the DAEMON (not this host) whether AppArmor is actually available. */
  private async refreshApparmorCapability(): Promise<void> {
    const info = await capture(this.bin, this.argv('info', '--format', '{{json .SecurityOptions}}'))
    if (info.code !== 0) return // leave the fail-closed default in place
    this.capabilities = dockerCaps(daemonReportsApparmor(info.stdout))
  }

  override async detect(): Promise<DetectResult> {
    const base = await super.detect()
    if (!base.available) return base
    await this.refreshApparmorCapability()

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
