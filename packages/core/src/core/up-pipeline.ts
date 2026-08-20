import { DcwError } from '../errors.js'
import type { EngineCapabilities, EngineDriver, EngineName, RunSpec } from '../engine/types.js'
import { enforceStrict, translate, type TranslateResult } from '../hardening/translator.js'
import type { EnvManifest } from '../state/manifest.js'
import { isEphemeralWorkspace, type ResolvedPlan } from './plan.js'

export const ENV_LABEL = 'dcw.env'

export interface UpOptions {
  manifest: EnvManifest
  plan: ResolvedPlan
  driver: EngineDriver
  capabilities: EngineCapabilities
  engineName: EngineName
  /** Host directory bind-mounted at /workspace (ignored for ephemeral workspaces). */
  workspaceDir: string
  strict?: boolean
  /** Publish the container's SSH port (2222) to this host port for `dcw attach --port`. */
  sshPublishPort?: number
  now: string
}

/** True when the plan air-gaps the container (`network-none`), which blocks published-port SSH. */
export function planHasNetworkNone(plan: ResolvedPlan): boolean {
  return plan.effects.some((e) => e.kind === 'network-none')
}

/** Container port the in-image sshd listens on in published-port (`--port`) mode. */
export const SSH_CONTAINER_PORT = 2222

export interface UpOutcome {
  manifest: EnvManifest
  containerId: string
  translation: TranslateResult
  runSpec: RunSpec
}

export function containerName(name: string): string {
  return `dcw-${name}`
}

/**
 * Start a hardened, detached container for an already-built environment.
 * Translates hardening to engine-correct flags (degrading per capabilities),
 * adds the workspace mount, runs, and records container state on the manifest.
 */
export async function upEnvironment(opts: UpOptions): Promise<UpOutcome> {
  const { manifest, plan, driver, capabilities, engineName, now } = opts

  if (!manifest.image?.tag) {
    throw new DcwError(`Environment '${manifest.name}' has no built image. Run 'dcw build ${manifest.name}' first.`)
  }

  const translation = translate(plan.effects, capabilities, engineName)
  if (opts.strict) enforceStrict(translation)

  const flags = [...translation.flags]
  if (!isEphemeralWorkspace(plan)) {
    flags.push('-v', `${opts.workspaceDir}:/workspace`)
  }

  if (opts.sshPublishPort !== undefined) {
    if (planHasNetworkNone(plan)) {
      throw new DcwError(
        `Cannot publish an SSH port: '${manifest.name}' is hardened with network-none. ` +
          'Attach over the default (no-port) exec proxy instead — run `dcw attach` without --port.',
      )
    }
    flags.push('-p', `${opts.sshPublishPort}:${SSH_CONTAINER_PORT}`)
  }

  const runSpec: RunSpec = {
    image: manifest.image.tag,
    name: containerName(manifest.name),
    labels: { [ENV_LABEL]: manifest.name },
    flags,
    workdir: '/workspace',
    detach: true,
    // Keep the container alive so the user can `exec` into it (shell-first).
    command: ['sleep', 'infinity'],
  }

  const { containerId } = await driver.run(runSpec)

  const updated: EnvManifest = {
    ...manifest,
    engine: engineName,
    container: {
      id: containerId,
      name: runSpec.name,
      status: 'running',
      startedAt: now,
      appliedFlags: flags,
      droppedHardening: translation.dropped.map((e) => e.kind),
      ssh: opts.sshPublishPort !== undefined ? { mode: 'port', port: opts.sshPublishPort } : undefined,
    },
    updatedAt: now,
  }

  return { manifest: updated, containerId, translation, runSpec }
}
