import { Command, Errors, Flags } from '@oclif/core'
import { DcwError, ExitCode } from './errors.js'

/**
 * A no-op `--json` flag for streaming pass-through commands (exec/shell/logs/agent)
 * which set `enableJsonFlag = false`. Accepting and ignoring `--json` keeps agents
 * that "always pass --json" working instead of hard-erroring on an unknown flag.
 */
export const ignoredJsonFlag = Flags.boolean({
  description: 'Accepted for compatibility; this streaming command has no JSON output.',
  hidden: true,
})

/**
 * Shared base for every dcw command.
 *
 * Provides the global, AI-native flags: `--json` (machine output), `--yes` /
 * `--no-input` (never prompt), `--engine` (target a specific container engine)
 * and `--strict` (treat dropped hardening as a hard error).
 */
export abstract class BaseCommand extends Command {
  static enableJsonFlag = true

  static baseFlags = {
    yes: Flags.boolean({
      char: 'y',
      description: 'Assume yes / accept defaults; do not prompt interactively.',
      default: false,
    }),
    'no-input': Flags.boolean({
      description: 'Never prompt; fail with a non-zero exit if input is required.',
      default: false,
    }),
    engine: Flags.string({
      description: 'Container engine to target (default: auto-detect).',
      options: ['auto', 'docker', 'podman', 'orbstack', 'apple-container', 'lima'],
      env: 'DCW_ENGINE',
    }),
    strict: Flags.boolean({
      description: 'Fail if a requested hardening option cannot be honored by the chosen engine.',
      default: false,
    }),
  }

  /** Map domain errors to their deterministic exit codes + machine code. */
  protected async catch(err: Error & { exitCode?: number }): Promise<unknown> {
    if (err instanceof DcwError) {
      // Under --json, emit a machine-readable envelope on stdout (with the
      // documented `code` field) instead of human text on stderr.
      if (this.jsonEnabled()) {
        this.logJson({ error: { code: err.code, message: err.message } })
        this.exit(err.exitCode)
      }
      this.error(err.message, { exit: err.exitCode, code: err.code })
    }
    // Untyped failures (fs errors, bugs) must still honor the --json contract:
    // a single {error:{code,message}} envelope, never a raw Node error object.
    // oclif's own CLIError/ExitError keep their normal handling.
    if (this.jsonEnabled() && !(err instanceof Errors.CLIError)) {
      const sys = (err as NodeJS.ErrnoException).code
      this.logJson({
        error: { code: 'E_INTERNAL', message: sys ? `${err.message} (${sys})` : err.message },
      })
      this.exit(ExitCode.GenericError)
    }
    return super.catch(err)
  }
}
