import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { NotFoundError, StrictHardeningError, ValidationError } from '../errors.js'
import { isValidEnvName } from '../util/slug.js'
import { detectHost, type HostInfo } from '../engine/host.js'
import { resolveEngine } from '../engine/resolver.js'
import type { DetectResult, EngineCapabilities, EngineDriver, EngineName } from '../engine/types.js'
import type { EnvManifest } from '../state/manifest.js'
import { listManifests, loadManifest } from '../state/store.js'

/**
 * Reject any environment name that isn't a safe, canonical identifier. User
 * input and `.dcw` markers are otherwise spliced verbatim into filesystem
 * paths (manifests, state dirs), so an unchecked `../…` traverses out of tree.
 */
function assertValidEnvName(name: string): string {
  if (!isValidEnvName(name)) {
    throw new ValidationError(`Invalid environment name '${name}'. Names must be lowercase slugs (a-z, 0-9, '.', '_', '-').`)
  }
  return name
}

/** Resolve the target environment name: positional → `.dcw` file → sole env. */
export async function resolveEnvName(positional?: string): Promise<string> {
  if (positional) return assertValidEnvName(positional)

  try {
    const dot = (await fs.readFile(path.join(process.cwd(), '.dcw'), 'utf8')).trim()
    if (dot) return assertValidEnvName(dot)
  } catch (err) {
    if (err instanceof ValidationError) throw err
    // no .dcw file
  }

  const all = await listManifests()
  if (all.length === 1) return all[0]!.name
  if (all.length === 0) {
    throw new NotFoundError('No environments found. Create one with `dcw create`.')
  }
  throw new NotFoundError(`Multiple environments exist; specify one of: ${all.map((m) => m.name).join(', ')}.`)
}

export async function requireManifest(name: string): Promise<EnvManifest> {
  const manifest = await loadManifest(name)
  if (!manifest) throw new NotFoundError(`Environment '${name}' not found.`)
  return manifest
}

export interface EngineContext {
  driver: EngineDriver
  engineName: EngineName
  capabilities: EngineCapabilities
  host: HostInfo
  detect: DetectResult
}

/**
 * Resolve the engine for a command: an explicit `--engine` flag wins, then the
 * environment's saved engine preference, then auto-detection.
 */
export async function resolveEngineFor(opts: {
  requested?: string
  manifestEngine?: string | null
}): Promise<EngineContext> {
  const host = await detectHost()
  const flagEngine = opts.requested && opts.requested !== 'auto' ? opts.requested : undefined
  const savedEngine = opts.manifestEngine && opts.manifestEngine !== 'auto' ? opts.manifestEngine : undefined
  const requested = flagEngine ?? savedEngine
  const { driver, detect } = await resolveEngine({ requested, host })
  return { driver, engineName: driver.name, capabilities: driver.capabilities, host, detect }
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Exec a command (default zsh) into an environment's running container. Returns the exit code. */
/**
 * Under `--strict`, refuse to enter a container whose hardening the engine could
 * not deliver.
 *
 * `--strict` promises to "fail if a requested hardening option cannot be honored".
 * `up`/`create` enforce that when they START a container, but `exec`, `shell` and
 * `attach` reach an ALREADY-running one, where the check was skipped entirely — so
 * `dcw shell --strict` would drop the user into a container that silently lost its
 * air-gap or capability drops. The container's manifest records what was actually
 * dropped at start time, so this needs no engine round-trip.
 *
 * Both dropped AND unenforced controls block, matching `enforceStrict`: a flag that
 * was emitted but does nothing (AppArmor on a Docker VM with no LSM) is exactly the
 * silent failure `--strict` exists to surface.
 */
export function assertStrictContainer(manifest: EnvManifest, strict?: boolean): void {
  if (!strict) return
  const dropped = manifest.container?.droppedHardening ?? []
  const unenforced = manifest.container?.unenforcedHardening ?? []
  const blocking = [...dropped, ...unenforced]
  if (blocking.length === 0) return
  throw new StrictHardeningError(
    `--strict: container '${manifest.name}' is running without hardening the engine could not honor: ` +
      `${blocking.join(', ')}. Recreate it on an engine that supports these, or drop --strict.`,
  )
}

export async function execInto(opts: {
  name: string
  cmd: string[]
  requested?: string
  env?: Record<string, string>
  /** Fail rather than enter a container with dropped hardening. */
  strict?: boolean
}): Promise<number> {
  const manifest = await requireManifest(opts.name)
  assertStrictContainer(manifest, opts.strict)
  if (!manifest.container?.name) {
    throw new NotFoundError(`Environment '${opts.name}' has no container. Start it with \`dcw up ${opts.name}\`.`)
  }
  const { driver } = await resolveEngineFor({
    requested: opts.requested,
    manifestEngine: manifest.engine ?? manifest.spec.engine,
  })
  const target = manifest.container.id ?? manifest.container.name
  // Only allocate a TTY / attach stdin when we actually have a terminal, so
  // `dcw exec env -- cmd` works non-interactively (agents, CI, pipes).
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  return driver.exec({
    container: target,
    cmd: opts.cmd.length > 0 ? opts.cmd : ['zsh'],
    interactive: tty,
    tty,
    env: opts.env,
  })
}
