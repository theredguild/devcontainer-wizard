import { Args } from '@oclif/core'
import { BaseCommand, ignoredJsonFlag } from '../base-command.js'
import { execInto, resolveEnvName } from '../cli/context.js'

export default class Shell extends BaseCommand {
  static description = 'Open an interactive zsh shell inside the environment\'s container.'
  static examples = ['<%= config.bin %> shell', '<%= config.bin %> shell my-env']

  // Streaming pass-through; the container's exit code is our exit code (no JSON).
  static enableJsonFlag = false

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    json: ignoredJsonFlag,
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Shell)
    const name = await resolveEnvName(args.name)
    const code = await execInto({ name, cmd: ['zsh'], requested: flags.engine, strict: flags.strict })
    this.exit(code)
  }
}
