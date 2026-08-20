import type { EngineCapabilities, EngineName } from '../types.js'
import { caps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/**
 * Lima runs containers via nerdctl inside a Linux guest VM (`lima nerdctl ...`).
 * Mirrors Docker, but AppArmor/sysctl depend on what the guest enables.
 */
export class LimaDriver extends CliDriver {
  readonly name: EngineName = 'lima'
  readonly displayName = 'Lima (nerdctl)'
  readonly capabilities: EngineCapabilities = caps({
    apparmor: {
      support: 'caveated',
      enforced: false,
      note: 'AppArmor depends on the Lima guest VM profile.',
    },
    sysctl: {
      support: 'caveated',
      note: 'sysctl support depends on the Lima guest VM.',
    },
  })

  constructor() {
    super({
      bin: 'lima',
      prefix: ['nerdctl'],
      versionBin: 'limactl',
      versionArgs: ['--version'],
    })
  }
}
