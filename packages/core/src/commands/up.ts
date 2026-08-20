import { Args, Flags } from '@oclif/core'
import { BaseCommand } from '../base-command.js'
import { nowIso, requireManifest, resolveEngineFor, resolveEnvName } from '../cli/context.js'
import { buildEnvironment } from '../core/build-pipeline.js'
import { planEnvironment } from '../core/plan.js'
import { containerName, upEnvironment } from '../core/up-pipeline.js'
import {
  enforceStrict,
  hardeningReport,
  translate,
  type HardeningReport,
  type HardeningWarning,
} from '../hardening/translator.js'
import { saveManifest } from '../state/store.js'

interface UpJson {
  name: string
  engine: string
  containerId: string
  appliedFlags: string[]
  warnings: HardeningWarning[]
  dropped: string[]
  failedTools: string[]
  toolsVerified: boolean
  /** Same data as the three fields above plus `unenforced`, in the shared shape
   *  used by `create --json` and `attach --json`. */
  hardening: HardeningReport
}

export default class Up extends BaseCommand {
  static description = 'Build (if needed) and start a hardened container, ready to shell into.'
  static examples = ['<%= config.bin %> up', '<%= config.bin %> up my-env --strict', '<%= config.bin %> up --workspace .']

  static args = {
    name: Args.string({ description: 'Environment name (defaults to the sole/.dcw environment).' }),
  }

  static flags = {
    rebuild: Flags.boolean({ description: 'Force an image rebuild before starting.', default: false }),
    workspace: Flags.string({ description: 'Host directory to mount at /workspace (default: cwd).' }),
  }

  async run(): Promise<UpJson> {
    const { args, flags } = await this.parse(Up)
    const name = await resolveEnvName(args.name)
    const manifest = await requireManifest(name)
    const plan = planEnvironment(manifest.spec)
    const { driver, engineName, capabilities } = await resolveEngineFor({
      requested: flags.engine,
      manifestEngine: manifest.spec.engine,
    })

    // Check --strict BEFORE building. upEnvironment enforces it too, but only after
    // the image is built — so a strict run that cannot succeed would spend minutes
    // building and then fail. The verdict depends only on plan + engine capabilities,
    // both known now.
    if (flags.strict) enforceStrict(translate(plan.effects, capabilities, engineName))

    const now = nowIso()
    const built = await buildEnvironment({ manifest, plan, driver, engineName, force: flags.rebuild, now })
    // Persist the image state immediately: if the run step below fails (--strict,
    // port conflict, …) the next `dcw up` must not rebuild from scratch.
    if (!built.skipped) await saveManifest(built.manifest)
    const failedTools = built.tools.filter((t) => !t.ok).map((t) => t.name)
    if (!this.jsonEnabled() && !built.skipped) {
      this.log(`Built ${built.tag}.`)
      if (failedTools.length > 0) this.warn(`tools failed to install: ${failedTools.join(', ')}`)
      else if (!built.toolsVerified) this.warn('could not read the in-image tool report; install status is unverified.')
    }

    // Fresh start: remove any prior container with the same name (best-effort).
    await driver.rm(containerName(name), { force: true }).catch(() => undefined)

    const outcome = await upEnvironment({
      manifest: built.manifest,
      plan,
      driver,
      capabilities,
      engineName,
      workspaceDir: flags.workspace ?? process.cwd(),
      strict: flags.strict,
      now,
    })
    await saveManifest(outcome.manifest)

    if (!this.jsonEnabled()) {
      this.log(`Started ${containerName(name)} on ${driver.displayName} (${outcome.containerId.slice(0, 12)}).`)
      for (const w of outcome.translation.warnings) {
        this.warn(`${w.level === 'dropped' ? 'dropped' : 'note'} [${w.effect}]: ${w.message}`)
      }
      this.log(`\nShell in with:  dcw shell ${name}`)
    }

    return {
      name,
      engine: engineName,
      containerId: outcome.containerId,
      appliedFlags: outcome.runSpec.flags,
      warnings: outcome.translation.warnings,
      dropped: outcome.translation.dropped.map((e) => e.kind),
      failedTools,
      toolsVerified: built.toolsVerified,
      hardening: hardeningReport(outcome.translation, outcome.runSpec.flags),
    }
  }
}
