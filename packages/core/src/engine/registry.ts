import type { EngineDriver, EngineName } from './types.js'
import { ALL_ENGINES } from './types.js'
import { DockerDriver } from './drivers/docker.js'
import { PodmanDriver } from './drivers/podman.js'
import { OrbstackDriver } from './drivers/orbstack.js'
import { LimaDriver } from './drivers/lima.js'
import { AppleContainerDriver } from './drivers/apple-container.js'

export function createDriver(name: EngineName): EngineDriver {
  switch (name) {
    case 'docker':
      return new DockerDriver()
    case 'podman':
      return new PodmanDriver()
    case 'orbstack':
      return new OrbstackDriver()
    case 'lima':
      return new LimaDriver()
    case 'apple-container':
      return new AppleContainerDriver()
    default: {
      const exhaustive: never = name
      throw new Error(`Unknown engine: ${String(exhaustive)}`)
    }
  }
}

export function createAllDrivers(): EngineDriver[] {
  return ALL_ENGINES.map((name) => createDriver(name))
}

export { ALL_ENGINES }
