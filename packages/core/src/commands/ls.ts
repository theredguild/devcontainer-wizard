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

    // Best-effort live reconciliation; tolerate a missing/unavailable engine.
    let containers: ContainerInfo[] = []
    try {
      const { driver } = await resolveEngineFor({ requested: flags.engine })
      containers = await driver.ps({ all: true })
    } catch {
      containers = []
    }
    const byName = new Map(containers.map((c) => [c.name, c]))

    const environments: EnvRow[] = manifests.map((m) => {
      const live = byName.get(containerName(m.name))
      const status = live
        ? /up|running/i.test(live.status)
          ? 'running'
          : 'stopped'
        : m.container
          ? 'absent'
          : 'never-started'
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
