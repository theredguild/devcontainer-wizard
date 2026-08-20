import { createHash, randomBytes } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { ValidationError } from '../errors.js'
import { EnvManifestSchema, SCHEMA_VERSION, SchemaVersionSchema, migrateManifest, type EnvManifest } from './manifest.js'
import { containerfilePath, environmentsDir, envStateDir, manifestPath } from './paths.js'

/** sha256 of Containerfile content (hex), used for build-staleness checks. */
export function hashContainerfile(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/** Owner-only modes for dcw state. Manifests record `appliedFlags`, which embed the
 *  absolute workspace path, repo URL and tooling choices — not other local accounts'
 *  business — so state is kept private rather than inheriting a 022 umask (0644/0755). */
const DIR_MODE = 0o700
const FILE_MODE = 0o600

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true, mode: DIR_MODE })
  // `mode` on mkdir applies only to directories it CREATES (and is umask-masked), so
  // a dcw dir left 0755 by an older version would stay world-readable forever.
  await fs.chmod(dir, DIR_MODE).catch(() => undefined)
  const tmp = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, content, { mode: FILE_MODE })
  // `mode` on writeFile is masked by the umask and ignored if the temp file were to
  // pre-exist; chmod before the rename so the published file is always 0600 — and so
  // rewriting an env whose manifest was previously world-readable tightens it.
  await fs.chmod(tmp, FILE_MODE)
  await fs.rename(tmp, filePath)
}

export async function saveManifest(manifest: EnvManifest): Promise<void> {
  const parsed = EnvManifestSchema.parse(manifest)
  await atomicWrite(manifestPath(parsed.name), `${JSON.stringify(parsed, null, 2)}\n`)
}

/** Load a manifest by name; returns null if it does not exist. */
export async function loadManifest(name: string): Promise<EnvManifest | null> {
  let raw: string
  try {
    raw = await fs.readFile(manifestPath(name), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new ValidationError(`Manifest for '${name}' is not valid JSON.`)
  }

  // Read the version envelope first so a future SCHEMA_VERSION bump degrades
  // gracefully: older manifests are migrated forward (so `ls` never loses them),
  // and a manifest written by a newer dcw is rejected with a clear message rather
  // than silently failing the version-locked schema.
  const ver = SchemaVersionSchema.safeParse(json)
  if (!ver.success) {
    throw new ValidationError(`Manifest for '${name}' is missing a valid schemaVersion.`)
  }
  if (ver.data.schemaVersion > SCHEMA_VERSION) {
    throw new ValidationError(
      `Manifest for '${name}' was written by a newer dcw (schemaVersion ${ver.data.schemaVersion} > ${SCHEMA_VERSION}); upgrade dcw to use it.`,
    )
  }

  try {
    const parsed = migrateManifest(json, ver.data.schemaVersion)
    // Commands resolve an environment by FILENAME but then act on the manifest's
    // inner `name` (image tag, container name, state dir). A mismatch therefore
    // lets `dcw build outer` build and persist state for `inner`, silently
    // clobbering another environment's namespace. listManifests() already skips
    // these; refuse to hand one back here too.
    if (parsed.name !== name) {
      throw new ValidationError(
        `Manifest file '${name}.json' declares a different environment name ('${parsed.name}'); refusing to use it.`,
      )
    }
    return parsed
  } catch (err) {
    if (err instanceof ValidationError) throw err
    const issue = (err as { issues?: { message?: string }[] }).issues?.[0]?.message
    throw new ValidationError(`Manifest for '${name}' is invalid: ${issue ?? 'unknown'}.`)
  }
}

/** List all valid manifests, skipping unreadable/invalid ones. */
export async function listManifests(): Promise<EnvManifest[]> {
  let files: string[]
  try {
    files = await fs.readdir(environmentsDir())
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const out: EnvManifest[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const name = file.slice(0, -'.json'.length)
    try {
      const m = await loadManifest(name)
      // Commands key off the filename, so a manifest whose internal `name` does
      // not match its filename is unreachable by that name — skip it rather than
      // list an env that no command can act on (consistent with how invalid
      // manifests are skipped here).
      if (m && m.name === name) out.push(m)
    } catch {
      // skip invalid manifests in listings
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function removeEnvironment(name: string): Promise<void> {
  await fs.rm(manifestPath(name), { force: true })
  await fs.rm(envStateDir(name), { recursive: true, force: true })
}

/** Write the generated Containerfile into the env's state dir; returns its path. */
export async function writeContainerfile(name: string, content: string): Promise<string> {
  const target = containerfilePath(name)
  await atomicWrite(target, content)
  return target
}
