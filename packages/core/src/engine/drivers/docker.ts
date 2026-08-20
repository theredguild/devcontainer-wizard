import type { DetectResult, EngineCapabilities, EngineName } from '../types.js'
import { capture } from '../exec.js'
import { daemonReportsApparmor, dockerCaps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/** Docker: full Linux MAC + capability + resource control. */
export class DockerDriver extends CliDriver {
  readonly name: EngineName = 'docker'
  readonly displayName = 'Docker'
  capabilities: EngineCapabilities = dockerCaps()

  constructor() {
    super({ bin: 'docker' })
  }

  override async detect(): Promise<DetectResult> {
    const base = await super.detect()
    if (base.available) await this.refreshApparmorCapability()
    return base
  }

  /** Ask the DAEMON (not this host) whether AppArmor is actually available. */
  protected async refreshApparmorCapability(): Promise<void> {
    const info = await capture(this.bin, this.argv('info', '--format', '{{json .SecurityOptions}}'))
    if (info.code !== 0) return // leave the fail-closed default in place
    this.capabilities = dockerCaps(daemonReportsApparmor(info.stdout))
  }
}
