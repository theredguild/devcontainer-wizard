import type { EngineCapabilities, EngineName } from '../types.js'
import { caps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/** Podman: near-Docker, but rootless userns affects uid-mapped tmpfs and AppArmor. */
export class PodmanDriver extends CliDriver {
  readonly name: EngineName = 'podman'
  readonly displayName = 'Podman'
  readonly capabilities: EngineCapabilities = caps({
    apparmor: {
      support: 'caveated',
      enforced: false,
      note: 'AppArmor enforcement depends on the host; may be a no-op in rootless mode.',
    },
    userNamespaces: {
      support: 'caveated',
      note: 'Rootless: uid/gid-mapped tmpfs mounts require --userns=keep-id (added automatically).',
    },
  })

  constructor() {
    super({ bin: 'podman' })
  }
}
