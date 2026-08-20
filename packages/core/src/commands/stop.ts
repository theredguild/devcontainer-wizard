import { Args } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { ENV_LABEL, containerName } from '../core/up-pipeline.js'
import { saveManifest } from '../state/store.js'

interface StopJson {
  name: string
  stopped: boolean
}

export default class Stop extends BaseCommand {
  static description = 'Stop an environment\'s running container.'
  static examples = ['<%= config.bin %> stop', '<%= config.bin %> stop my-env']

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  async run(): Promise<StopJson> {
    const { args, flags } = await this.parse(Stop)
    const name = await resolveEnvName(args.name)
    const manifest = await requireManifest(name)
    const { driver } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.engine ?? manifest.spec.engine,
    })

    // Nothing to stop if no container was ever recorded — benign and idempotent.
    if (!manifest.container) {
      if (!this.jsonEnabled()) this.log(`Nothing to stop for '${name}'.`)
      return { name, stopped: false }
    }

    // Reconcile against the engine: if the container is already gone, this is a
    // benign no-op (don't pretend we stopped it). Only when the container is
    // actually present do we issue the stop and let genuine engine failures
    // surface as a typed DcwError.
    const target = manifest.container.id ?? containerName(name)
    const present = await driver.ps({ label: `${ENV_LABEL}=${name}`, all: true })
    if (present.length === 0) {
      if (!this.jsonEnabled()) this.log(`Nothing to stop for '${name}' (no container).`)
      return { name, stopped: false }
    }

    await driver.stop(target)

    await saveManifest({
      ...manifest,
      container: { ...manifest.container, status: 'stopped' },
      updatedAt: nowIso(),
    })

    if (!this.jsonEnabled()) this.log(`Stopped ${target}.`)
    return { name, stopped: true }
  }
}
