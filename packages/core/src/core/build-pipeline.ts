import { REPORT_PATH } from '../containerfile/guard.js'
import type { EngineDriver, EngineName } from '../engine/types.js'
import type { EnvManifest, ToolStatus } from '../state/manifest.js'
import { envStateDir } from '../state/paths.js'
import { writeContainerfile } from '../state/store.js'
import type { ResolvedPlan } from './plan.js'

/** Parse the in-image `<tool>=ok|fail` report; any `fail` line marks a tool failed. */
export function parseToolReport(stdout: string): ToolStatus[] {
  const status = new Map<string, boolean>()
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(.+)=(ok|fail)$/)
    if (!m) continue
    const [, name, result] = m
    const ok = result === 'ok'
    // Any failure for a tool wins.
    status.set(name!, (status.get(name!) ?? true) && ok)
  }
  return [...status.entries()].map(([name, ok]) => ({ name, ok })).sort((a, b) => a.name.localeCompare(b.name))
}

export interface BuildOptions {
  manifest: EnvManifest
  plan: ResolvedPlan
  driver: EngineDriver
  engineName: EngineName
  force?: boolean
  platform?: string
  /** ISO timestamp (injected so the pipeline stays deterministic/testable). */
  now: string
}

export interface BuildOutcome {
  manifest: EnvManifest
  imageId: string
  tag: string
  containerfilePath: string
  /** True when an up-to-date image already existed and the build was skipped. */
  skipped: boolean
  /** Per-tool best-effort install results (empty if there were no leaf tools). */
  tools: ToolStatus[]
  /**
   * False when leaf tools were expected but the in-image report could not be
   * read — so an empty `tools` means "verification did not run", NOT "all clean".
   */
  toolsVerified: boolean
}

export function imageTag(name: string): string {
  return `dcw/${name}:latest`
}

/**
 * Build the environment image. Writes the generated Containerfile, then skips
 * the build when an up-to-date image already exists (same hash + same engine),
 * unless `force` is set. Returns the manifest updated with image state.
 */
export async function buildEnvironment(opts: BuildOptions): Promise<BuildOutcome> {
  const { manifest, plan, driver, engineName, now } = opts
  const tag = imageTag(manifest.name)
  const cfPath = await writeContainerfile(manifest.name, plan.containerfile)

  const upToDate =
    !opts.force &&
    manifest.image !== null &&
    manifest.image.containerfileHash === plan.containerfileHash &&
    manifest.image.imageId !== undefined &&
    manifest.engine === engineName

  if (upToDate && manifest.image) {
    return {
      manifest,
      imageId: manifest.image.imageId!,
      tag,
      containerfilePath: cfPath,
      skipped: true,
      tools: manifest.image.tools ?? [],
      toolsVerified: true,
    }
  }

  const { imageId } = await driver.build({
    containerfilePath: cfPath,
    contextDir: envStateDir(manifest.name),
    tag,
    platform: opts.platform,
    noCache: opts.force,
  })

  // Read back the best-effort install report from the freshly built image. The
  // probe is a throwaway `cat` that needs neither network nor capabilities, so
  // harden it where the engine supports it (a paranoid/airgapped env shouldn't
  // spin up an unconstrained container just to read a file).
  let tools: ToolStatus[] = []
  let toolsVerified = true
  if (plan.tools.tools.length > 0) {
    const probeFlags: string[] = []
    if (driver.capabilities.networkNone.support === 'supported') probeFlags.push('--network=none')
    if (driver.capabilities.capDrop.support === 'supported') probeFlags.push('--cap-drop=ALL')
    const report = await driver.runOnce(tag, ['cat', REPORT_PATH], probeFlags).catch(() => ({ stdout: '', code: 1 }))
    // A non-zero probe means the report is unreadable — verification did not run.
    toolsVerified = report.code === 0
    if (toolsVerified) tools = parseToolReport(report.stdout)
  }

  const updated: EnvManifest = {
    ...manifest,
    engine: engineName,
    image: {
      tag,
      imageId,
      containerfileHash: plan.containerfileHash,
      builtAt: now,
      ...(tools.length > 0 ? { tools } : {}),
    },
    resolved: {
      requiredTools: plan.tools.all,
      hardeningKeys: plan.spec.hardening,
    },
    updatedAt: now,
  }

  return { manifest: updated, imageId, tag, containerfilePath: cfPath, skipped: false, tools, toolsVerified }
}
