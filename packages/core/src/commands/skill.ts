import { BaseCommand, ignoredJsonFlag } from '../base-command.js'
import { readSkill } from '../skill.js'

/**
 * Print the packaged agent skill (SKILL.md) to stdout.
 *
 * Also reachable as the top-level `dcw --skill` flag (aliased in bin/), so agents
 * and humans can install it with e.g.
 * `dcw --skill > ~/.claude/skills/dcw/SKILL.md`.
 */
export default class Skill extends BaseCommand {
  static description = 'Print the agent skill file (SKILL.md) teaching AI agents how to drive dcw, and exit.'
  static examples = [
    '<%= config.bin %> --skill',
    '<%= config.bin %> skill',
    'mkdir -p ~/.claude/skills/dcw && <%= config.bin %> --skill > ~/.claude/skills/dcw/SKILL.md',
  ]

  // Raw markdown pass-through: no JSON envelope, but accept --json as a no-op.
  static enableJsonFlag = false
  // None of the global engine/prompt flags apply to a static print.
  static baseFlags = {} as typeof BaseCommand.baseFlags
  static flags = { json: ignoredJsonFlag }

  async run(): Promise<void> {
    process.stdout.write(readSkill())
  }
}
