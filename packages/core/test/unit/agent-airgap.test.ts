import { describe, expect, it } from 'vitest'
import { assessAirgap } from '../../src/commands/agent.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'

const NOW = '2026-06-11T00:00:00.000Z'

function manifest(hardening: string[], droppedHardening?: string[], appliedFlags: string[] = []): EnvManifest {
  const spec = EnvSpecSchema.parse({ name: 'demo', hardening })
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
      ? { id: 'cid', name: 'dcw-demo', status: 'running', startedAt: NOW, appliedFlags, droppedHardening }
      : null,
  }
}

describe('assessAirgap — do not forward secrets into a container we wrongly call air-gapped', () => {
  it('reports no air-gap when none was requested', () => {
    expect(assessAirgap(manifest(['drop-caps'], [], ['--cap-drop=ALL']))).toBe('none')
  })

  it('reports an enforced air-gap only when --network=none is actually in the applied flags', () => {
    expect(assessAirgap(manifest(['network-none'], [], ['--network=none']))).toBe('enforced')
  })

  it('reports DROPPED when the flags show the air-gap never reached the engine', () => {
    // Nothing recorded as dropped, but the container was demonstrably launched
    // without the flag — trust the evidence, not the absence of a complaint.
    expect(assessAirgap(manifest(['network-none'], [], ['--cap-drop=ALL']))).toBe('dropped')
  })

  it('reports UNKNOWN when no flags were recorded, rather than assuming success', () => {
    // Absence of evidence must not read as evidence of enforcement: callers treat
    // 'unknown' as unsafe, because credentials are about to be forwarded.
    expect(assessAirgap(manifest(['network-none'], []))).toBe('unknown')
  })

  it('reports a DROPPED air-gap when the engine could not apply it', () => {
    // e.g. Apple Containers: --network=none is not honored, so the container is
    // online even though the user asked for an air-gap.
    expect(assessAirgap(manifest(['network-none'], ['network-none']))).toBe('dropped')
  })

  it('treats a not-yet-started environment as unknown, never as enforced', () => {
    expect(assessAirgap(manifest(['network-none']))).toBe('unknown')
  })
})
