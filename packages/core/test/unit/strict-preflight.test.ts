import { describe, expect, it } from 'vitest'
import { assertStrictContainer } from '../../src/cli/context.js'
import { StrictHardeningError } from '../../src/errors.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'

const NOW = '2026-06-11T00:00:00.000Z'

function manifest(droppedHardening?: string[], unenforcedHardening: string[] = []): EnvManifest {
  const spec = EnvSpecSchema.parse({ name: 'demo', hardening: ['network-none', 'drop-caps'] })
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'demo',
    createdAt: NOW,
    updatedAt: NOW,
    spec,
    resolved: { requiredTools: [], hardeningKeys: spec.hardening },
    engine: 'docker',
    image: { tag: 'dcw/demo:latest', imageId: 'sha256:x', containerfileHash: 'h', builtAt: NOW },
    container: droppedHardening
      ? { id: 'cid', name: 'dcw-demo', status: 'running', startedAt: NOW, appliedFlags: [], droppedHardening, unenforcedHardening }
      : null,
  }
}

describe('assertStrictContainer — --strict must fail closed on already-running containers', () => {
  it('throws when entering a container whose hardening was dropped', () => {
    expect(() => assertStrictContainer(manifest(['network-none']), true)).toThrow(StrictHardeningError)
  })

  it('names the dropped controls so the user knows what is missing', () => {
    expect(() => assertStrictContainer(manifest(['network-none', 'apparmor']), true)).toThrow(
      /network-none, apparmor/,
    )
  })

  it('also throws for a control that was emitted but is not enforced', () => {
    // AppArmor on a Docker daemon with no LSM: nothing was "dropped", the flag is
    // right there on the command line — and it does nothing. Checking only
    // droppedHardening would let `dcw shell --strict` walk straight into it.
    expect(() => assertStrictContainer(manifest([], ['apparmor']), true)).toThrow(StrictHardeningError)
    expect(() => assertStrictContainer(manifest([], ['apparmor']), true)).toThrow(/apparmor/)
  })

  it('allows a container with nothing dropped and nothing unenforced', () => {
    expect(() => assertStrictContainer(manifest([], []), true)).not.toThrow()
  })

  it('is a no-op without --strict, so normal use is unaffected', () => {
    expect(() => assertStrictContainer(manifest(['network-none']), false)).not.toThrow()
    expect(() => assertStrictContainer(manifest(['network-none']), undefined)).not.toThrow()
  })
})
