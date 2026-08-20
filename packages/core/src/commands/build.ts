import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { buildEnvironment } from '../core/build-pipeline.js'
import { planEnvironment } from '../core/plan.js'
import { saveManifest } from '../state/store.js'

interface BuildJson {
  name: string
  engine: string
  tag: string
  imageId: string
  skipped: boolean
  failedTools: string[]
  /** False when tool installs could not be verified (report unreadable). */
  toolsVerified: boolean
}

export default class Build extends BaseCommand {
  static description = 'Build the container image for an environment.'
  static examples = ['<%= config.bin %> build', '<%= config.bin %> build my-env --force']

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    force: Flags.boolean({ description: 'Rebuild even if the image is up to date.', default: false }),
    platform: Flags.string({ description: 'Target platform (e.g. linux/amd64).' }),
  }

  async run(): Promise<BuildJson> {
    const { args, flags } = await this.parse(Build)
    const name = await resolveEnvName(args.name)
    const manifest = await requireManifest(name)
    const plan = planEnvironment(manifest.spec)
    const { driver, engineName } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.spec.engine,
    })

    if (!this.jsonEnabled()) {
      this.log(`Building '${name}' with ${driver.displayName}…`)
    }

    const outcome = await buildEnvironment({
      manifest,
      plan,
      driver,
      engineName,
      force: flags.force,
      platform: flags.platform,
      now: nowIso(),
    })
    await saveManifest(outcome.manifest)

    const failedTools = outcome.tools.filter((t) => !t.ok).map((t) => t.name)
    if (!this.jsonEnabled()) {
      this.log(
        outcome.skipped
          ? `Image ${outcome.tag} is up to date (skipped).`
          : `Built ${outcome.tag} (${outcome.imageId.slice(0, 19)}).`,
      )
      if (failedTools.length > 0) this.warn(`tools failed to install: ${failedTools.join(', ')}`)
      else if (!outcome.toolsVerified) this.warn('could not read the in-image tool report; install status is unverified.')
    }

    return {
      name,
      engine: engineName,
      tag: outcome.tag,
      imageId: outcome.imageId,
      skipped: outcome.skipped,
      failedTools,
      toolsVerified: outcome.toolsVerified,
    }
  }
}
