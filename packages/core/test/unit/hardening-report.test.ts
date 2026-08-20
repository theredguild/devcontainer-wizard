import { describe, expect, it } from 'vitest'
import { planEnvironment } from '../../src/core/plan.js'
import { AppleContainerDriver } from '../../src/engine/drivers/apple-container.js'
import { caps } from '../../src/engine/drivers/capabilities.js'
import { hardeningReport, translate } from '../../src/hardening/translator.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'

function reportFor(hardening: string[], engine: 'docker' | 'apple-container') {
  const spec = EnvSpecSchema.parse({ name: 'demo', hardening })
  const plan = planEnvironment(spec)
  const capabilities = engine === 'docker' ? caps() : new AppleContainerDriver().capabilities
  const t = translate(plan.effects, capabilities, engine)
  return hardeningReport(t, t.flags)
}

describe('hardeningReport — the --json hardening contract', () => {
  it('names every control the engine could not honor, so agents can see it', () => {
    // The airgapped promise is the whole point of the profile; if an engine cannot
    // enforce it, `--json` consumers must be able to detect that from the envelope
    // alone, since this.warn() output never reaches them.
    const report = reportFor(['network-none'], 'apple-container')
    expect(report.dropped).toContain('network-none')
    expect(report.warnings.some((w) => w.level === 'dropped')).toBe(true)
    expect(report.appliedFlags).not.toContain('--network=none')
  })

  it('reports an air-gap that IS enforced as applied and not dropped', () => {
    const report = reportFor(['network-none'], 'docker')
    expect(report.dropped).not.toContain('network-none')
    expect(report.appliedFlags).toContain('--network=none')
  })

  it('exposes appliedFlags, warnings, dropped and unenforced on every report', () => {
    const report = reportFor(['drop-caps'], 'docker')
    expect(Object.keys(report).sort()).toEqual(['appliedFlags', 'dropped', 'unenforced', 'warnings'])
    expect(Array.isArray(report.unenforced)).toBe(true)
  })
})
