import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { removeSshConfig } from '../core/ssh/ssh-config.js'
import { ENV_LABEL, containerName } from '../core/up-pipeline.js'
import { DcwError, ExitCode, ValidationError } from '../errors.js'
import { removeEnvironment, saveManifest } from '../state/store.js'
import type { EnvManifest } from '../state/manifest.js'

interface RmJson {
  name: string
  removedContainer: boolean
  purged: boolean
}

export default class Rm extends BaseCommand {
  static description = 'Remove an environment\'s container (and optionally the environment itself).'
  static examples = ['<%= config.bin %> rm my-env', '<%= config.bin %> rm my-env --purge --yes']

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    purge: Flags.boolean({ description: 'Also delete the environment record, state, and generated Containerfile.', default: false }),
  }

  async run(): Promise<RmJson> {
    const { args, flags } = await this.parse(Rm)
    const name = await resolveEnvName(args.name)

    if (flags.purge && !flags.yes) {
      throw new DcwError(`Refusing to purge '${name}' without confirmation. Re-run with --yes.`, ExitCode.UsageError, 'E_CONFIRM')
    }

    // A manifest that no longer validates (written by an older dcw, hand-edited,
    // or rejected by a tightened schema) must still be purgeable — otherwise it is
    // stuck: hidden from `ls` and unremovable. Under --purge we fall back to a
    // best-effort container removal by label and then delete the record anyway.
    let manifest: EnvManifest | null = null
    try {
      manifest = await requireManifest(name)
    } catch (err) {
      if (!(flags.purge && err instanceof ValidationError)) throw err
      this.warn(`${err.message} Purging the invalid record anyway.`)
    }

    const { driver } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest?.engine ?? manifest?.spec.engine,
    })

    // Remove the container only when one is actually present. A missing/already-
    // removed container is a benign no-op; a genuine engine failure surfaces as a
    // typed DcwError rather than being swallowed.
    let removedContainer = false
    if (!manifest || manifest.container) {
      const target = manifest?.container?.id ?? containerName(name)
      const present = await driver.ps({ label: `${ENV_LABEL}=${name}`, all: true })
      if (present.length > 0) {
        await driver.rm(target, { force: true })
        removedContainer = true
      }
    }

    if (flags.purge) {
      await removeEnvironment(name)
      await removeSshConfig(name).catch(() => undefined)
      if (!this.jsonEnabled()) this.log(`Purged environment '${name}'.`)
      return { name, removedContainer, purged: true }
    }

    // Non-purge path: manifest is guaranteed valid here (invalid ones threw above).
    await saveManifest({ ...manifest!, container: null, updatedAt: nowIso() })
    if (!this.jsonEnabled()) {
      this.log(
        removedContainer
          ? `Removed container for '${name}'. Run \`dcw up ${name}\` to restart.`
          : `No container to remove for '${name}'.`,
      )
    }
    return { name, removedContainer, purged: false }
  }
}
