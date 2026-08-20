import { BaseCommand } from '../base-command.js'
import { resolveEngineFor } from '../cli/context.js'
import { containerName } from '../core/up-pipeline.js'
import type { ContainerInfo } from '../engine/types.js'
import { listManifests } from '../state/store.js'

interface EnvRow {
  name: string
  engine: string | null
  built: boolean
  /** Live status reconciled against the engine: running | stopped | absent | unknown. */
  status: string
  tools: number
  hardening: number
}

export default class Ls extends BaseCommand {
  static description = 'List environments with their live container status.'
  static examples = ['<%= config.bin %> ls', '<%= config.bin %> ls --json']

  async run(): Promise<{ environments: EnvRow[] }> {
    const { flags } = await this.parse(Ls)
    const manifests = await listManifests()

    // Reconcile each environment against ITS OWN engine. Probing a single
    // auto-detected engine reported every env created on a different one as
    // 'absent' even while its container was running.
    // `spec.engine` carries a schema default of 'auto', so every manifest names an
    // engine target even before one has been resolved — no null key is possible.
    const byEngine = new Map<string, ContainerInfo[]>()
    const unreachable = new Set<string>()
    const targets = flags.engine
      ? new Set<string>([flags.engine])
      : new Set<string>(manifests.map((m) => m.engine ?? m.spec.engine))

    for (const engine of targets) {
      try {
        const { driver } = await resolveEngineFor({
          requested: flags.engine,
          manifestEngine: engine,
        })
        byEngine.set(engine, await driver.ps({ all: true }))
      } catch {
        // Engine missing or its daemon is down: we genuinely do not know whether
        // those containers exist, so record it rather than asserting 'absent'.
        unreachable.add(engine)
      }
    }

    const environments: EnvRow[] = manifests.map((m) => {
      const key: string = flags.engine ?? m.engine ?? m.spec.engine
      const live = (byEngine.get(key) ?? []).find((c) => c.name === containerName(m.name))
      const status = live
        ? /up|running/i.test(live.status)
          ? 'running'
          : 'stopped'
        : !m.container
          ? 'never-started'
          : unreachable.has(key)
            ? // Distinguish "the engine could not tell us" from "it is gone".
              'unknown'
            : 'absent'
      return {
        name: m.name,
        engine: m.engine,
        built: m.image !== null,
        status,
        tools: m.resolved.requiredTools.length,
        hardening: m.resolved.hardeningKeys.length,
      }
    })

    if (!this.jsonEnabled()) {
      if (environments.length === 0) {
        this.log('No environments yet. Create one with `dcw create`.')
      } else {
        this.log('NAME                 ENGINE           BUILT  STATUS')
        for (const e of environments) {
          this.log(
            `${e.name.padEnd(20)} ${(e.engine ?? '-').padEnd(16)} ${(e.built ? 'yes' : 'no').padEnd(6)} ${e.status}`,
          )
        }
      }
    }

    return { environments }
  }
}
