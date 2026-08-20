import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveManifest, writeContainerfile } from '../../src/state/store.js'
import { environmentsDir, manifestPath, containerfilePath } from '../../src/state/paths.js'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'
import { EnvSpecSchema } from '../../src/spec/env-spec.js'

const NOW = '2026-06-11T00:00:00.000Z'
let tmp: string
let prevConfig: string | undefined
let prevState: string | undefined

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dcw-perm-'))
  prevConfig = process.env.XDG_CONFIG_HOME
  prevState = process.env.XDG_STATE_HOME
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'config')
  process.env.XDG_STATE_HOME = path.join(tmp, 'state')
})

afterEach(async () => {
  if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = prevConfig
  if (prevState === undefined) delete process.env.XDG_STATE_HOME
  else process.env.XDG_STATE_HOME = prevState
  await fs.rm(tmp, { recursive: true, force: true })
})

function manifest(): EnvManifest {
  const spec = EnvSpecSchema.parse({ name: 'demo', hardening: ['drop-caps'] })
  return {
    schemaVersion: SCHEMA_VERSION,
    name: 'demo',
    createdAt: NOW,
    updatedAt: NOW,
    spec,
    resolved: { requiredTools: [], hardeningKeys: spec.hardening },
    engine: 'docker',
    image: null,
    container: null,
  }
}

async function mode(p: string): Promise<string> {
  return ((await fs.stat(p)).mode & 0o777).toString(8)
}

describe('dcw state file permissions', () => {
  it('writes manifests private to the owner (0600), not world-readable', async () => {
    await saveManifest(manifest())
    // Manifests record appliedFlags, which embed the absolute workspace path and
    // repo/tooling choices — not another local account's business.
    expect(await mode(manifestPath('demo'))).toBe('600')
  })

  it('creates the environments directory as 0700', async () => {
    await saveManifest(manifest())
    expect(await mode(environmentsDir())).toBe('700')
  })

  it('writes the generated Containerfile as 0600', async () => {
    await writeContainerfile('demo', 'FROM debian:trixie\n')
    expect(await mode(containerfilePath('demo'))).toBe('600')
  })

  it('tightens a directory an older version left world-readable', async () => {
    // mkdir's `mode` only applies to directories it creates, so a dcw dir left 0755
    // by an earlier version would otherwise stay readable by every local account.
    await fs.mkdir(environmentsDir(), { recursive: true, mode: 0o755 })
    await fs.chmod(environmentsDir(), 0o755)
    await saveManifest(manifest())
    expect(await mode(environmentsDir())).toBe('700')
  })

  it('tightens permissions on rewrite even if a prior file was world-readable', async () => {
    await saveManifest(manifest())
    await fs.chmod(manifestPath('demo'), 0o644)
    await saveManifest({ ...manifest(), updatedAt: '2026-06-12T00:00:00.000Z' })
    expect(await mode(manifestPath('demo'))).toBe('600')
  })
})
