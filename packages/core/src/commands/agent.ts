import { Args, Flags } from '@oclif/core'
import { BaseCommand, ignoredJsonFlag } from '../base-command.js'
import { assertStrictContainer, execInto, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { DcwError, NotFoundError, StrictHardeningError, ValidationError } from '../errors.js'
import type { EnvManifest } from '../state/manifest.js'
import { listManifests } from '../state/store.js'

/** How an environment's requested air-gap actually turned out at run time. */
export type AirgapState = 'none' | 'enforced' | 'dropped' | 'unknown'

/**
 * Decide whether the container this agent is about to run in is really air-gapped.
 *
 * `spec.hardening` records what was *requested*; the container record says what the
 * engine actually delivered. Reasoning from the request alone inverts the truth on
 * engines that cannot enforce `--network=none` (e.g. Apple Containers): dcw would
 * tell the user the agent has no network — and then forward their provider API key
 * into a container that is, in fact, online.
 *
 * Absence of evidence is NOT evidence of enforcement: a container with no recorded
 * flags returns 'unknown', which callers must treat as unsafe. Only a positive
 * `--network=none` in the flags the container was actually launched with counts.
 */
export function assessAirgap(manifest: EnvManifest): AirgapState {
  if (!manifest.spec.hardening.includes('network-none')) return 'none'

  const container = manifest.container
  if (!container) return 'unknown' // never started — nothing was applied to anything
  if ((container.droppedHardening ?? []).includes('network-none')) return 'dropped'

  const flags = container.appliedFlags
  if (!flags || flags.length === 0) return 'unknown' // no record of what was applied
  return flags.some((f) => f === '--network=none' || f.startsWith('--network=none'))
    ? 'enforced'
    : 'dropped'
}

/** AI coding agents that can be baked in (see catalog `aiAgents`) and spawned. */
const AGENTS = {
  claude: { bin: 'claude', pkg: '@anthropic-ai/claude-code', keys: ['ANTHROPIC_API_KEY'] },
  codex: { bin: 'codex', pkg: '@openai/codex', keys: ['OPENAI_API_KEY'] },
  opencode: { bin: 'opencode', pkg: 'opencode-ai', keys: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] },
} as const

type AgentType = keyof typeof AGENTS
const AGENT_TYPES = Object.keys(AGENTS) as AgentType[]

/**
 * Resolve `--env` entries to forwarded variables. Only bare NAMEs are accepted:
 * an inline `NAME=value` would sit in dcw's own argv (world-readable via
 * `ps`/procfs on most hosts) for the whole interactive agent session, so it is
 * rejected with a message that never echoes the value.
 */
export function parseEnvForwards(
  entries: readonly string[],
  hostEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const entry of entries) {
    const eq = entry.indexOf('=')
    if (eq >= 0) {
      const varName = entry.slice(0, eq) || '<empty>'
      throw new ValidationError(
        `--env ${varName}=… is not supported: values on the command line leak via the process table. ` +
          `Export ${varName} on the host and pass --env ${varName} instead.`,
      )
    }
    if (!entry) throw new ValidationError('Invalid --env entry: empty variable name.')
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry)) {
      throw new ValidationError(`Invalid --env entry '${entry}': not a valid environment variable name.`)
    }
    const v = hostEnv[entry]
    if (v !== undefined) env[entry] = v
  }
  return env
}

export default class Agent extends BaseCommand {
  static description = "Spawn an AI coding agent (claude, codex, opencode) inside an environment's running container."
  static examples = [
    '<%= config.bin %> agent claude',
    '<%= config.bin %> agent codex my-env',
    '<%= config.bin %> agent opencode -- run "review this contract"',
    '<%= config.bin %> agent claude my-env --env GITHUB_TOKEN',
  ]

  // Streaming pass-through; the agent's exit code is our exit code (no JSON).
  static enableJsonFlag = false

  // Allow arbitrary trailing args to be forwarded to the agent CLI.
  static strict = false

  static args = {
    type: Args.string({
      description: 'Agent to spawn.',
      required: true,
      options: AGENT_TYPES as unknown as string[],
    }),
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    env: Flags.string({
      char: 'e',
      multiple: true,
      description: 'Forward an extra env var into the container by NAME (value read from the host environment; inline NAME=value is rejected so secrets never appear in argv).',
    }),
    install: Flags.boolean({
      description: 'Install the agent CLI on-demand if missing (npm install -g; needs Node + network).',
      default: false,
    }),
    json: ignoredJsonFlag,
  }

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(Agent)
    const tokens = argv as string[]

    const type = tokens[0] as AgentType
    if (!AGENT_TYPES.includes(type)) {
      throw new ValidationError(`Unknown agent '${tokens[0]}'. Choose one of: ${AGENT_TYPES.join(', ')}.`)
    }
    const agent = AGENTS[type]

    // After the agent type: an optional env name, then trailing args for the CLI.
    // The first token is only the env name when it actually names an existing
    // environment; otherwise it (and the rest) are arguments forwarded to the agent.
    const rest = tokens.slice(1)
    const first = rest[0]
    const namesEnv = first !== undefined && !first.startsWith('-') && (await listManifests()).some((m) => m.name === first)
    const name = await resolveEnvName(namesEnv ? first : undefined)
    const trailing = namesEnv ? rest.slice(1) : rest

    const manifest = await requireManifest(name)

    // Agents need to reach their provider API. Warn (or fail under --strict) when
    // the environment is air-gapped — and distinguish an air-gap that actually
    // holds from one the engine silently dropped, because we are about to forward
    // provider credentials into this container.
    // Refuse a weakened container up front: everything below (installing the agent
    // CLI, forwarding credentials) mutates or exposes it, so --strict must be
    // decided before any of that happens.
    assertStrictContainer(manifest, flags.strict)

    const airgap = assessAirgap(manifest)
    if (airgap === 'enforced') {
      const msg = `Environment '${name}' is hardened with network-none; ${agent.bin} cannot reach its API.`
      if (flags.strict) throw new StrictHardeningError(msg)
      this.warn(msg)
    } else if (airgap === 'dropped' || airgap === 'unknown') {
      const detail =
        airgap === 'dropped'
          ? 'but the engine could not enforce it — this container HAS network access'
          : 'but dcw has no record that it was applied — assume this container HAS network access'
      const msg =
        `Environment '${name}' requested network-none, ${detail}. Credentials forwarded to ` +
        `${agent.bin} are reachable by anything running inside it. Re-create on an engine that ` +
        'supports network-none, or re-run with --strict to refuse.'
      if (flags.strict) throw new StrictHardeningError(msg)
      this.warn(msg)
    }

    // Forward the agent's provider key(s) from the host, plus any extra --env vars.
    const env: Record<string, string> = {}
    for (const key of agent.keys) {
      const v = process.env[key]
      if (v !== undefined) env[key] = v
    }
    Object.assign(env, parseEnvForwards(flags.env ?? [], process.env))
    if (!agent.keys.some((k) => k in env)) {
      this.warn(
        `No API key found on the host (${agent.keys.join(' or ')}); ${agent.bin} will rely on its own login.`,
      )
    }

    // Confirm the binary is present; offer a fix or do an on-demand install.
    const { driver } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.engine ?? manifest.spec.engine,
    })
    const target = manifest.container?.id ?? manifest.container?.name
    if (!target) {
      throw new NotFoundError(`Environment '${name}' has no container. Start it with \`dcw up ${name}\`.`)
    }

    // Tools (node, the agent bin, …) live on the interactive-zsh PATH (nvm +
    // ~/.zshrc), not the bare exec PATH — so everything runs through `zsh -ic`.
    const present = await driver.execCapture({
      container: target,
      cmd: ['zsh', '-ic', `command -v ${agent.bin}`],
      interactive: false,
      tty: false,
    })
    if (present.code !== 0) {
      if (flags.install) {
        this.log(`Installing ${agent.bin} (npm install -g ${agent.pkg})…`)
        const res = await driver.execCapture({
          container: target,
          cmd: ['zsh', '-ic', `npm install -g ${agent.pkg}`],
          interactive: false,
          tty: false,
        })
        if (res.code !== 0) {
          throw new DcwError(`Failed to install ${agent.pkg}: ${res.stderr.trim() || res.stdout.trim()}`)
        }
      } else {
        throw new NotFoundError(
          `'${agent.bin}' is not installed in '${name}'. Recreate with \`dcw create --ai-agent ${type}\`, ` +
            `or pass --install to add it on-demand.`,
        )
      }
    }

    // `zsh -ic 'exec bin "$@"' bin <args>`: load the login PATH, then hand the
    // TTY to the agent. Args are passed as positionals so they aren't re-split.
    const cmd = ['zsh', '-ic', `exec ${agent.bin} "$@"`, agent.bin, ...trailing]
    const code = await execInto({ name, cmd, requested: flags.engine, env, strict: flags.strict })
    this.exit(code)
  }
}
