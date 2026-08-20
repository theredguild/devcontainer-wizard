import * as path from 'node:path'
import { Flags } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, resolveEngineFor } from '../cli/context.js'
import { buildEnvironment } from '../core/build-pipeline.js'
import { planEnvironment } from '../core/plan.js'
import { containerName, upEnvironment } from '../core/up-pipeline.js'
import { CancelledError, ValidationError } from '../errors.js'
import { flagsToSpec, type FlagInput } from '../spec/flags-to-spec.js'
import type { EnvSpec } from '../spec/env-spec.js'
import { SCHEMA_VERSION, type EnvManifest } from '../state/manifest.js'
import { loadManifest, saveManifest } from '../state/store.js'

interface CreateJson {
  name: string
  spec: EnvSpec
  built: boolean
  started: boolean
  container?: string
  failedTools: string[]
  toolsVerified: boolean
}

export default class Create extends BaseCommand {
  static description = 'Create a container environment, interactively (wizard) or from flags.'
  static examples = [
    '<%= config.bin %> create',
    '<%= config.bin %> create --name audit --core-lang rust --framework foundry --sec slither --profile hardened',
    '<%= config.bin %> create --no-input --framework foundry --build --json',
  ]

  static flags = {
    name: Flags.string({ description: 'Environment name (defaults to the current directory name).' }),
    'core-lang': Flags.string({ multiple: true, description: 'Core languages: rust, python, go, node.' }),
    lang: Flags.string({ multiple: true, description: 'Smart-contract languages: solidity, vyper.' }),
    framework: Flags.string({ multiple: true, description: 'Frameworks: foundry, hardhat, ape.' }),
    fuzz: Flags.string({ multiple: true, description: 'Fuzzing/testing: echidna, medusa, halmos, ityfuzz, aderyn.' }),
    sec: Flags.string({ multiple: true, description: 'Security tooling: slither, mythril, semgrep, heimdall, …' }),
    'ai-agent': Flags.string({ multiple: true, description: 'AI coding agents: claude, codex, opencode.' }),
    profile: Flags.string({ description: 'Security profile (e.g. development, hardened, airgapped, paranoid).' }),
    harden: Flags.string({ multiple: true, description: 'Manual hardening keys (merged with --profile).' }),
    'git-url': Flags.string({ description: 'Clone this git repository into the image.' }),
    'git-branch': Flags.string({ description: 'Branch/tag to clone (requires --git-url).' }),
    ssh: Flags.boolean({
      description: 'Bake an SSH server for editor attach (dcw attach). Use --no-ssh to omit.',
      allowNo: true,
      default: true,
    }),
    build: Flags.boolean({ description: 'Build the image after creating.', default: false }),
    up: Flags.boolean({ description: 'Build and start the container after creating.', default: false }),
    force: Flags.boolean({ description: 'Overwrite an existing environment with the same name.', default: false }),
  }

  private flagInput(flags: Record<string, unknown>): FlagInput {
    return {
      name: flags.name as string | undefined,
      coreLanguages: flags['core-lang'] as string[] | undefined,
      languages: flags.lang as string[] | undefined,
      frameworks: flags.framework as string[] | undefined,
      fuzzingAndTesting: flags.fuzz as string[] | undefined,
      securityTooling: flags.sec as string[] | undefined,
      aiAgents: flags['ai-agent'] as string[] | undefined,
      profile: flags.profile as string | undefined,
      hardening: flags.harden as string[] | undefined,
      engine: flags.engine as string | undefined,
      gitUrl: flags['git-url'] as string | undefined,
      gitBranch: flags['git-branch'] as string | undefined,
      ssh: flags.ssh as boolean | undefined,
      fallbackName: path.basename(process.cwd()),
    }
  }

  async run(): Promise<CreateJson> {
    const { flags } = await this.parse(Create)

    const interactive =
      Boolean(process.stdin.isTTY && process.stdout.isTTY) &&
      !this.jsonEnabled() &&
      !flags['no-input'] &&
      !flags.yes

    let spec: EnvSpec
    if (interactive) {
      // Lazily load the ink wizard so the JSON/non-TTY path never touches React.
      const { mountWizard } = await import('../wizard/run.js')
      const result = await mountWizard({ initial: this.flagInput(flags) })
      if (!result) throw new CancelledError('Environment creation cancelled.')
      spec = result
    } else {
      spec = flagsToSpec(this.flagInput(flags))
    }

    if (!flags.force && (await loadManifest(spec.name))) {
      throw new ValidationError(`Environment '${spec.name}' already exists. Pass --force to overwrite or choose a different --name.`)
    }

    const now = nowIso()
    const plan = planEnvironment(spec)
    let manifest: EnvManifest = {
      schemaVersion: SCHEMA_VERSION,
      name: spec.name,
      createdAt: now,
      updatedAt: now,
      spec,
      resolved: { requiredTools: plan.tools.all, hardeningKeys: spec.hardening },
      engine: null,
      image: null,
      container: null,
    }
    await saveManifest(manifest)
    if (!this.jsonEnabled()) this.log(`Created environment '${spec.name}'.`)

    let started = false
    let containerId: string | undefined
    let failedTools: string[] = []
    let toolsVerified = true

    if (flags.build || flags.up) {
      const { driver, engineName, capabilities } = await resolveEngineFor({
        requested: flags.engine,
        manifestEngine: spec.engine,
      })
      const built = await buildEnvironment({ manifest, plan, driver, engineName, now })
      manifest = built.manifest
      await saveManifest(manifest)
      failedTools = built.tools.filter((t) => !t.ok).map((t) => t.name)
      toolsVerified = built.toolsVerified
      if (!this.jsonEnabled()) {
        this.log(`Built ${built.tag}.`)
        if (failedTools.length > 0) this.warn(`tools failed to install: ${failedTools.join(', ')}`)
        else if (!toolsVerified) this.warn('could not read the in-image tool report; install status is unverified.')
      }

      if (flags.up) {
        await driver.rm(containerName(spec.name), { force: true }).catch(() => undefined)
        const up = await upEnvironment({
          manifest,
          plan,
          driver,
          capabilities,
          engineName,
          workspaceDir: process.cwd(),
          strict: flags.strict,
          now,
        })
        manifest = up.manifest
        await saveManifest(manifest)
        started = true
        containerId = up.containerId
        if (!this.jsonEnabled()) {
          this.log(`Started ${containerName(spec.name)}.`)
          for (const w of up.translation.warnings) {
            this.warn(`${w.level === 'dropped' ? 'dropped' : 'note'} [${w.effect}]: ${w.message}`)
          }
        }
      }
    }

    if (!this.jsonEnabled() && !flags.up) {
      this.log(`Next: dcw up ${spec.name}`)
    }

    return {
      name: spec.name,
      spec,
      built: manifest.image !== null,
      started,
      container: containerId,
      failedTools,
      toolsVerified,
    }
  }
}
