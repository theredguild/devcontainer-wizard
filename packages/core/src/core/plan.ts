import { generateContainerfile } from '../containerfile/generate.js'
import { resolveTools, type ResolvedTools } from '../domain/dependency-resolver.js'
import type { HardeningKey } from '../domain/hardening.js'
import { hardeningToEffects, type HardeningEffect } from '../hardening/effects.js'
import type { EnvSpec } from '../spec/env-spec.js'
import { hashContainerfile } from '../state/store.js'

export interface ResolvedPlan {
  spec: EnvSpec
  tools: ResolvedTools
  effects: HardeningEffect[]
  containerfile: string
  containerfileHash: string
}

/** Pure resolution: selections → tools, hardening → effects, → Containerfile. Engine-independent. */
export function planEnvironment(spec: EnvSpec): ResolvedPlan {
  const tools = resolveTools(spec.selections)
  const effects = hardeningToEffects(spec.hardening as HardeningKey[])
  const containerfile = generateContainerfile({
    selections: spec.selections,
    gitRepository: spec.gitRepository,
    ssh: spec.ssh,
  })
  return {
    spec,
    tools,
    effects,
    containerfile,
    containerfileHash: hashContainerfile(containerfile),
  }
}

/** Whether an environment has an ephemeral (tmpfs) workspace rather than a bind mount. */
export function isEphemeralWorkspace(plan: ResolvedPlan): boolean {
  return plan.effects.some((e) => e.kind === 'ephemeral-workspace')
}
