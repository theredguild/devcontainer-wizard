import { describe, expect, it } from 'vitest'
import { EngineUnavailableError, EngineUnsupportedError, NoEngineError } from '../../src/errors.js'
import type { HostInfo } from '../../src/engine/host.js'
import { createAllDrivers } from '../../src/engine/registry.js'
import { resolveEngine, surveyEngines } from '../../src/engine/resolver.js'
import type { EngineDriver, EngineName } from '../../src/engine/types.js'
import { FakeDriver } from './fake-driver.js'

const macSilicon: HostInfo = { os: 'macos', arch: 'arm64', macosMajor: 15 }
const linux: HostInfo = { os: 'linux', arch: 'x64' }

function drivers(spec: Partial<Record<EngineName, boolean>>): EngineDriver[] {
  const all: EngineName[] = ['docker', 'podman', 'orbstack', 'apple-container', 'lima']
  return all.map(
    (name) =>
      new FakeDriver({
        name,
        detect: { available: spec[name] ?? false, reason: spec[name] ? undefined : 'not detected' },
      }),
  )
}

describe('resolveEngine (auto)', () => {
  it('picks orbstack first on macOS when available', async () => {
    const res = await resolveEngine({ host: macSilicon, drivers: drivers({ orbstack: true, docker: true }) })
    expect(res.driver.name).toBe('orbstack')
  })

  it('falls through to docker when orbstack is unavailable', async () => {
    const res = await resolveEngine({ host: macSilicon, drivers: drivers({ orbstack: false, docker: true }) })
    expect(res.driver.name).toBe('docker')
  })

  it('never auto-selects a platform-unsupported engine', async () => {
    // apple-container "available" but on linux it is platform-unsupported and must be skipped.
    const res = await resolveEngine({ host: linux, drivers: drivers({ 'apple-container': true, podman: true }) })
    expect(res.driver.name).toBe('podman')
  })

  it('throws NoEngineError when nothing is available', async () => {
    await expect(resolveEngine({ host: linux, drivers: drivers({}) })).rejects.toBeInstanceOf(NoEngineError)
  })
})

describe('resolveEngine (explicit --engine)', () => {
  it('honors a supported + available request', async () => {
    const res = await resolveEngine({ requested: 'docker', host: linux, drivers: drivers({ docker: true }) })
    expect(res.driver.name).toBe('docker')
  })

  it('rejects an engine unsupported on the host', async () => {
    await expect(
      resolveEngine({ requested: 'apple-container', host: linux, drivers: drivers({ 'apple-container': true }) }),
    ).rejects.toBeInstanceOf(EngineUnsupportedError)
  })

  it('rejects a supported but unavailable engine', async () => {
    await expect(
      resolveEngine({ requested: 'docker', host: linux, drivers: drivers({ docker: false }) }),
    ).rejects.toBeInstanceOf(EngineUnavailableError)
  })
})

describe('surveyEngines', () => {
  it('marks apple-container unsupported on linux and hides it from recommendation', async () => {
    const statuses = await surveyEngines({ host: linux, drivers: drivers({ docker: true, 'apple-container': true }) })
    const apple = statuses.find((s) => s.name === 'apple-container')!
    expect(apple.platform.supported).toBe(false)
    expect(apple.recommended).toBe(false)
    const recommended = statuses.find((s) => s.recommended)
    expect(recommended?.name).toBe('docker')
  })

  it('exposes capability notes for degraded engines (real drivers)', async () => {
    const statuses = await surveyEngines({ host: linux, drivers: createAllDrivers(), skipDetect: true })
    const podman = statuses.find((s) => s.name === 'podman')!
    expect(podman.capabilities.userNamespaces.support).toBe('caveated')
    const apple = statuses.find((s) => s.name === 'apple-container')!
    expect(apple.capabilities.capDrop.support).toBe('unsupported')
  })
})
