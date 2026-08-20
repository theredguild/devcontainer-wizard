import { Args } from '@oclif/core'
import { BaseCommand, ignoredJsonFlag } from '../base-command.js'
import { execInto, resolveEnvName } from '../cli/context.js'
import { listManifests } from '../state/store.js'

export default class Exec extends BaseCommand {
  static description = 'Run a command inside an environment\'s running container.'
  static examples = ['<%= config.bin %> exec my-env -- ls -la', '<%= config.bin %> exec -- forge --version']

  // Streaming pass-through: the container's exit code is our exit code, so there
  // is no JSON payload. `--json` would corrupt that code via oclif's ExitError.
  static enableJsonFlag = false

  // Allow an arbitrary trailing command after the environment name.
  static strict = false

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    json: ignoredJsonFlag,
  }

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(Exec)
    const tokens = argv as string[]

    // The first token is only the env name when it actually names an existing
    // environment; otherwise it (and the rest) are the command to run, and the
    // env is resolved with no positional (sole/.dcw). This keeps the documented
    // `dcw exec -- forge --version` form working instead of mistaking 'forge'
    // for an env name.
    const first = tokens[0]
    const namesEnv = first !== undefined && !first.startsWith('-') && (await listManifests()).some((m) => m.name === first)
    const name = await resolveEnvName(namesEnv ? first : undefined)
    const cmd = namesEnv ? tokens.slice(1) : tokens
    const code = await execInto({ name, cmd, requested: flags.engine, strict: flags.strict })
    this.exit(code)
  }
}
