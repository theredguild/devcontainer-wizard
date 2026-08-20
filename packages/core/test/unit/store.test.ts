import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  hashContainerfile,
  listManifests,
  loadManifest,
  removeEnvironment,
  saveManifest,
  writeContainerfile,
} from '../../src/state/store.js'
import { containerfilePath, manifestPath } from '../../src/state/paths.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'
import { ValidationError } from '../../src/errors.js'

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-store-'))
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
  process.env.XDG_STATE_HOME = path.join(tmp, 'state')
})

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME
  delete process.env.XDG_STATE_HOME
  await fs.rm(tmp, { recursive: true, force: true })
})

function fixture(name: string): EnvManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: '2026-06-11T00:00:00.000Z',
    updatedAt: '2026-06-11T00:00:00.000Z',
    spec: { name, engine: 'auto', selections: { frameworks: ['foundry'] }, hardening: ['drop-caps'], ssh: true },
    resolved: { requiredTools: ['rust', 'foundry'], hardeningKeys: ['drop-caps'] },
    engine: null,
    image: null,
    container: null,
  }
}

describe('store', () => {
  it('round-trips a manifest', async () => {
    const m = fixture('alpha')
    await saveManifest(m)
    const loaded = await loadManifest('alpha')
    expect(loaded).toEqual(m)
  })

  it('returns null for a missing manifest', async () => {
    expect(await loadManifest('nope')).toBeNull()
  })

  it('lists saved manifests sorted by name', async () => {
    await saveManifest(fixture('beta'))
    await saveManifest(fixture('alpha'))
    const names = (await listManifests()).map((m) => m.name)
    expect(names).toEqual(['alpha', 'beta'])
  })

  it('removes a manifest and its state dir', async () => {
    await saveManifest(fixture('gamma'))
    await writeContainerfile('gamma', 'FROM debian:bookworm')
    await removeEnvironment('gamma')
    expect(await loadManifest('gamma')).toBeNull()
    await expect(fs.access(containerfilePath('gamma'))).rejects.toBeTruthy()
  })

  it('writes the Containerfile to the env state dir', async () => {
    const p = await writeContainerfile('delta', 'FROM debian:bookworm')
    expect(p).toBe(containerfilePath('delta'))
    expect(await fs.readFile(p, 'utf8')).toBe('FROM debian:bookworm')
  })

  it('hashes Containerfile content deterministically', () => {
    expect(hashContainerfile('abc')).toBe(hashContainerfile('abc'))
    expect(hashContainerfile('abc')).not.toBe(hashContainerfile('abd'))
  })

  it('raises a clean ValidationError for malformed manifest JSON (#6)', async () => {
    const p = manifestPath('busted')
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, '{ "name": "busted", ') // truncated JSON
    await expect(loadManifest('busted')).rejects.toBeInstanceOf(ValidationError)
  })

  it('survives concurrent writes to the same target without corruption (#14)', async () => {
    await Promise.all(Array.from({ length: 8 }, () => writeContainerfile('race', 'FROM debian:bookworm')))
    expect(await fs.readFile(containerfilePath('race'), 'utf8')).toBe('FROM debian:bookworm')
    // No stray .tmp files left behind in the state dir.
    const leftovers = (await fs.readdir(path.dirname(containerfilePath('race')))).filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })
})

describe('manifest filename/name consistency', () => {
  it('rejects a manifest whose inner name does not match its filename', async () => {
    // Commands key off the filename but then act on the manifest's inner name, so a
    // mismatch lets `dcw build a` build, tag and persist state for environment `b`
    // — silently clobbering another environment's namespace. listManifests() already
    // skips these; loadManifest() must not hand one back.
    await saveManifest(fixture('inner'))
    await fs.writeFile(manifestPath('outer'), JSON.stringify(fixture('inner'), null, 2))
    await expect(loadManifest('outer')).rejects.toThrow(ValidationError)
    // The correctly-named one still loads.
    expect((await loadManifest('inner'))?.name).toBe('inner')
  })
})
