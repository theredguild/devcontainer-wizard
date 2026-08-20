import { Args, Flags } from '@oclif/core'
import { BaseCommand, ignoredJsonFlag } from '../base-command.js'
import { requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { containerName } from '../core/up-pipeline.js'
import { NotFoundError } from '../errors.js'

export default class Logs extends BaseCommand {
  static description = 'Show logs from an environment\'s container.'
  static examples = ['<%= config.bin %> logs my-env', '<%= config.bin %> logs --follow']

  // Streaming pass-through; the container's exit code is our exit code (no JSON).
  static enableJsonFlag = false

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    follow: Flags.boolean({ char: 'f', description: 'Follow log output.', default: false }),
    tail: Flags.integer({ description: 'Number of lines to show from the end.', min: 0 }),
    json: ignoredJsonFlag,
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Logs)
    const name = await resolveEnvName(args.name)
    const manifest = await requireManifest(name)
    if (!manifest.container?.name) {
      throw new NotFoundError(`Environment '${name}' has no container.`)
    }
    const { driver } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.engine ?? manifest.spec.engine,
    })
    const target = manifest.container.id ?? containerName(name)
    const code = await driver.logs(target, { follow: flags.follow, tail: flags.tail })
    this.exit(code)
  }
}
