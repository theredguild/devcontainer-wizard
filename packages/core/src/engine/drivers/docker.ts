import type { EngineCapabilities, EngineName } from '../types.js'
import { caps } from './capabilities.js'
import { CliDriver } from './cli-driver.js'

/** Docker: full Linux MAC + capability + resource control. */
export class DockerDriver extends CliDriver {
  readonly name: EngineName = 'docker'
  readonly displayName = 'Docker'
  readonly capabilities: EngineCapabilities = caps()

  constructor() {
    super({ bin: 'docker' })
  }
}
