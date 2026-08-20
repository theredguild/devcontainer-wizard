import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listManifests, loadManifest, saveManifest } from '../../src/state/store.js'
import { manifestPath } from '../../src/state/paths.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'
import { ValidationError } from '../../src/errors.js'

let tmp: string

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-migrate-'))
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

async function writeRaw(name: string, obj: unknown): Promise<void> {
  const p = manifestPath(name)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(obj, null, 2))
}

describe('manifest schema migration (#bug3)', () => {
  it('loads a manifest at the current schemaVersion', async () => {
    await saveManifest(fixture('alpha'))
    expect((await loadManifest('alpha'))?.name).toBe('alpha')
  })

  it('rejects a manifest written by a newer dcw with a friendly ValidationError', async () => {
    await writeRaw('future', { ...fixture('future'), schemaVersion: SCHEMA_VERSION + 1 })
    await expect(loadManifest('future')).rejects.toBeInstanceOf(ValidationError)
    await expect(loadManifest('future')).rejects.toThrow(/newer dcw/i)
  })

  it('rejects a manifest missing a usable schemaVersion', async () => {
    const { schemaVersion: _omit, ...rest } = fixture('noversion')
    void _omit
    await writeRaw('noversion', rest)
    await expect(loadManifest('noversion')).rejects.toBeInstanceOf(ValidationError)
  })

  it('still rejects field-level garbage in the strict spec (version tolerance != field tolerance)', async () => {
    const m = fixture('garbage')
    await writeRaw('garbage', { ...m, spec: { ...m.spec, bogusField: true } })
    await expect(loadManifest('garbage')).rejects.toBeInstanceOf(ValidationError)
  })

  it('skips a newer-version manifest in listings without crashing', async () => {
    await saveManifest(fixture('ok'))
    await writeRaw('newer', { ...fixture('newer'), schemaVersion: SCHEMA_VERSION + 1 })
    const names = (await listManifests()).map((m) => m.name)
    expect(names).toEqual(['ok'])
  })
})

describe('listManifests filename/name integrity (#bug7)', () => {
  it('skips a manifest whose internal name does not match its filename', async () => {
    await saveManifest(fixture('real'))
    // A file named mismatch.json whose internal name is "other" is unreachable by
    // command name → it must not appear in `ls`.
    await writeRaw('mismatch', { ...fixture('other') })
    const names = (await listManifests()).map((m) => m.name)
    expect(names).toEqual(['real'])
  })
})
