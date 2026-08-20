import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { SCHEMA_VERSION, type EnvManifest } from '../../src/state/manifest.js'

const T0 = '2026-06-11T00:00:00.000Z'

/** A minimal, schema-valid manifest; `over` is merged shallowly over the defaults. */
export function manifest(over: Partial<EnvManifest> = {}): EnvManifest {
  const name = over.name ?? 'env1'
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    createdAt: T0,
    updatedAt: T0,
    spec: { name, engine: 'auto', selections: {}, hardening: [], ssh: true },
    resolved: { requiredTools: [], hardeningKeys: [] },
    engine: null,
    image: null,
    container: null,
    ...over,
  } as EnvManifest
}

/**
 * Point the XDG roots at a fresh temp dir for the duration of a test, and return
 * a disposer. dcw resolves every state path lazily through these, so this keeps
 * manifests out of the developer's real ~/.config.
 */
export async function useTempState(prefix = 'dcw-test-'): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const prevConfig = process.env.XDG_CONFIG_HOME
  const prevState = process.env.XDG_STATE_HOME
  process.env.XDG_CONFIG_HOME = path.join(dir, 'config')
  process.env.XDG_STATE_HOME = path.join(dir, 'state')
  return {
    dir,
    cleanup: async () => {
      if (prevConfig === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = prevConfig
      if (prevState === undefined) delete process.env.XDG_STATE_HOME
      else process.env.XDG_STATE_HOME = prevState
      await fs.rm(dir, { recursive: true, force: true })
    },
  }
}
