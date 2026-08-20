import { BaseCommand } from '../base-command.js'
import { describeHost, detectHost } from '../engine/host.js'
import { surveyEngines, type EngineStatus } from '../engine/resolver.js'
import type { CapSupport } from '../engine/types.js'

interface EngineReport {
  name: string
  displayName: string
  supported: boolean
  reason?: string
  available?: boolean
  version?: string
  recommended: boolean
  caveats: string[]
  unsupported: string[]
}

interface EnginesJson {
  host: { os: string; arch: string; macosMajor?: number }
  engines: EngineReport[]
}

function collectCaps(status: EngineStatus): { caveats: string[]; unsupported: string[] } {
  const caveats: string[] = []
  const unsupported: string[] = []
  for (const [key, cap] of Object.entries(status.capabilities)) {
    const support = cap.support as CapSupport
    if (support === 'caveated') caveats.push(`${key}: ${cap.note ?? 'caveat'}`)
    else if (support === 'unsupported') unsupported.push(`${key}: ${cap.note ?? 'unsupported'}`)
  }
  return { caveats, unsupported }
}

/** List container engines with platform support, availability, and hardening trade-offs. */
export default class Engines extends BaseCommand {
  static description = 'List container engines: platform support, availability, and hardening trade-offs.'
  static examples = ['<%= config.bin %> engines', '<%= config.bin %> engines --json']

  async run(): Promise<EnginesJson> {
    const host = await detectHost()
    const statuses = await surveyEngines({ host })

    const engines: EngineReport[] = statuses.map((s) => {
      const { caveats, unsupported } = collectCaps(s)
      return {
        name: s.name,
        displayName: s.displayName,
        supported: s.platform.supported,
        reason: s.platform.reason,
        available: s.detect?.available,
        version: s.detect?.version,
        recommended: s.recommended,
        caveats,
        unsupported,
      }
    })

    if (!this.jsonEnabled()) {
      this.log(`Host: ${describeHost(host)}\n`)
      for (const e of engines) {
        const mark = !e.supported ? '  ✗' : e.available ? (e.recommended ? '★ ' : '✓ ') : '· '
        const state = !e.supported
          ? `unsupported (${e.reason ?? 'n/a'})`
          : e.available
            ? `available${e.version ? ` — ${e.version}` : ''}${e.recommended ? '  [recommended]' : ''}`
            : 'not detected'
        this.log(`${mark} ${e.displayName.padEnd(20)} ${state}`)
        if (e.supported && e.unsupported.length > 0) {
          this.log(`     drops: ${e.unsupported.map((u) => u.split(':')[0]).join(', ')}`)
        }
      }
    }

    return { host: { os: host.os, arch: host.arch, macosMajor: host.macosMajor }, engines }
  }
}
