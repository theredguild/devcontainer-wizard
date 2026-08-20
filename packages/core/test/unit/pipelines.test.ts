import { describe, expect, it } from 'vitest'
import { planEnvironment } from '../../src/core/plan.js'
import { buildEnvironment, imageTag } from '../../src/core/build-pipeline.js'
import { ENV_LABEL, upEnvironment } from '../../src/core/up-pipeline.js'
import { createDriver } from '../../src/engine/registry.js'
import { StrictHardeningError } from '../../src/errors.js'
import { EnvSpecSchema, type EnvSpec } from '../../src/spec/env-spec.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'
import { FakeDriver } from '../engine/fake-driver.js'

const NOW = '2026-06-11T00:00:00.000Z'

function spec(overrides: Partial<EnvSpec> = {}): EnvSpec {
  return EnvSpecSchema.parse({ name: 'demo', selections: { frameworks: ['foundry'] }, hardening: ['drop-caps'], ...overrides })
}

function manifestFor(s: EnvSpec): EnvManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: s.name,
    createdAt: NOW,
    updatedAt: NOW,
    spec: s,
    resolved: { requiredTools: [], hardeningKeys: s.hardening },
    engine: null,
    image: null,
    container: null,
  }
}

describe('planEnvironment', () => {
  it('produces a containerfile, effects, and a stable hash', () => {
    const plan = planEnvironment(spec())
    expect(plan.containerfile).toContain('FROM debian:trixie')
    expect(plan.effects.some((e) => e.kind === 'drop-cap')).toBe(true)
    expect(plan.containerfileHash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('buildEnvironment', () => {
  it('builds and records image state', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker' })
    const plan = planEnvironment(s)
    const out = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'docker', now: NOW })

    expect(driver.builds).toHaveLength(1)
    expect(driver.builds[0]!.tag).toBe(imageTag('demo'))
    expect(out.manifest.image?.containerfileHash).toBe(plan.containerfileHash)
    expect(out.manifest.engine).toBe('docker')
    expect(out.skipped).toBe(false)
  })

  it('skips the build when image is up-to-date', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker' })
    const plan = planEnvironment(s)
    const first = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'docker', now: NOW })
    const second = await buildEnvironment({ manifest: first.manifest, plan, driver, engineName: 'docker', now: NOW })
    expect(second.skipped).toBe(true)
    expect(driver.builds).toHaveLength(1)
  })

  it('rebuilds with force', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker' })
    const plan = planEnvironment(s)
    const first = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'docker', now: NOW })
    await buildEnvironment({ manifest: first.manifest, plan, driver, engineName: 'docker', now: NOW, force: true })
    expect(driver.builds).toHaveLength(2)
  })

  it('hardens the report probe and marks tools verified on Docker (#N4)', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker' })
    const plan = planEnvironment(s)
    expect(plan.tools.tools.length).toBeGreaterThan(0) // probe only runs with leaf tools
    const out = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'docker', now: NOW })
    expect(driver.runOnces).toHaveLength(1)
    expect(driver.runOnces[0]!.flags).toEqual(['--network=none', '--cap-drop=ALL'])
    expect(out.toolsVerified).toBe(true)
  })

  it('marks tools unverified (not falsely clean) when the report is unreadable (#N4)', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker', runOnceResult: { stdout: '', code: 1 } })
    const plan = planEnvironment(s)
    const out = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'docker', now: NOW })
    expect(out.toolsVerified).toBe(false)
    expect(out.tools).toEqual([])
  })

  it('omits unsupported probe flags on non-Docker engines (#N4)', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'apple-container', capabilities: createDriver('apple-container').capabilities })
    const plan = planEnvironment(s)
    await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: 'apple-container', now: NOW })
    // apple-container has no --network=none, but it does enforce --cap-drop, so the
    // throwaway `cat` probe should still run with capabilities dropped.
    expect(driver.runOnces[0]!.flags).toEqual(['--cap-drop=ALL'])
  })
})

describe('upEnvironment', () => {
  async function built(s: EnvSpec, driver: FakeDriver) {
    const plan = planEnvironment(s)
    const b = await buildEnvironment({ manifest: manifestFor(s), plan, driver, engineName: driver.name, now: NOW })
    return { plan, manifest: b.manifest }
  }

  it('runs detached with hardening flags + bind workspace + label', async () => {
    const s = spec()
    const driver = new FakeDriver({ name: 'docker' })
    const { plan, manifest } = await built(s, driver)
    const out = await upEnvironment({
      manifest,
      plan,
      driver,
      capabilities: driver.capabilities,
      engineName: 'docker',
      workspaceDir: '/home/me/project',
      now: NOW,
    })

    const run = driver.runs[0]!
    expect(run.detach).toBe(true)
    expect(run.command).toEqual(['sleep', 'infinity'])
    expect(run.labels).toEqual({ [ENV_LABEL]: 'demo' })
    expect(run.flags).toContain('--cap-drop=ALL')
    expect(run.flags).toContain('-v')
    expect(run.flags).toContain('/home/me/project:/workspace')
    expect(out.manifest.container?.status).toBe('running')
  })

  it('uses a tmpfs workspace (no bind) for ephemeral environments', async () => {
    const s = spec({ hardening: ['ephemeral-workspace'] })
    const driver = new FakeDriver({ name: 'docker' })
    const { plan, manifest } = await built(s, driver)
    await upEnvironment({
      manifest,
      plan,
      driver,
      capabilities: driver.capabilities,
      engineName: 'docker',
      workspaceDir: '/home/me/project',
      now: NOW,
    })
    const run = driver.runs[0]!
    expect(run.flags).not.toContain('-v')
    expect(run.flags.join(' ')).toContain('/workspace:rw')
  })

  it('records dropped hardening on the manifest for degraded engines', async () => {
    const s = spec({ hardening: ['drop-caps', 'apparmor', 'network-none'] })
    const driver = new FakeDriver({ name: 'apple-container', capabilities: createDriver('apple-container').capabilities })
    const { plan, manifest } = await built(s, driver)
    const out = await upEnvironment({
      manifest,
      plan,
      driver,
      capabilities: driver.capabilities,
      engineName: 'apple-container',
      workspaceDir: '/tmp/x',
      now: NOW,
    })
    // drop-caps IS honored by the container CLI, so only the genuinely
    // unavailable controls are recorded as dropped.
    expect(out.manifest.container?.droppedHardening).toEqual(expect.arrayContaining(['apparmor', 'network-none']))
    expect(out.manifest.container?.droppedHardening).not.toContain('drop-cap')
    expect(out.translation.dropped.length).toBeGreaterThan(0)
  })

  it('throws under --strict when hardening is dropped', async () => {
    const s = spec({ hardening: ['apparmor'] })
    const driver = new FakeDriver({ name: 'apple-container', capabilities: createDriver('apple-container').capabilities })
    const { plan, manifest } = await built(s, driver)
    await expect(
      upEnvironment({
        manifest,
        plan,
        driver,
        capabilities: driver.capabilities,
        engineName: 'apple-container',
        workspaceDir: '/tmp/x',
        now: NOW,
        strict: true,
      }),
    ).rejects.toBeInstanceOf(StrictHardeningError)
  })
})
