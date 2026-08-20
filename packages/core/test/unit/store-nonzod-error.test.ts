import * as fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTempState } from '../helpers/fixtures.js'

// Model a migration step that fails with something other than a ZodError — what a
// future `case N: v1ToV2(raw)` would throw if it hit a bug of its own.
vi.mock('../../src/state/manifest.js', async (orig) => {
  const actual = await orig<typeof import('../../src/state/manifest.js')>()
  return {
    ...actual,
    migrateManifest: (raw: unknown, from: number) => {
      if (thrown) throw thrown
      return actual.migrateManifest(raw, from)
    },
  }
})

let thrown: unknown

const { loadManifest, saveManifest } = await import('../../src/state/store.js')
const { manifest } = await import('../helpers/fixtures.js')

let state: Awaited<ReturnType<typeof useTempState>>

beforeEach(async () => {
  state = await useTempState('dcw-store-nonzod-')
  thrown = undefined
  await saveManifest(manifest({ name: 'env1' }))
})

afterEach(async () => {
  await state.cleanup()
  vi.clearAllMocks()
})

describe('loadManifest migration failures', () => {
  it('reports the first zod issue when the manifest fails validation', async () => {
    const { manifestPath } = await import('../../src/state/paths.js')
    await fs.writeFile(manifestPath('env1'), JSON.stringify({ schemaVersion: 1, name: 'env1' }))
    await expect(loadManifest('env1')).rejects.toMatchObject({
      code: 'E_VALIDATION',
      message: expect.stringMatching(/^Manifest for 'env1' is invalid: .+\.$/),
    })
  })

  it('still produces a typed ValidationError when the failure carries no zod issues', async () => {
    thrown = new Error('migration step exploded')
    await expect(loadManifest('env1')).rejects.toMatchObject({
      code: 'E_VALIDATION',
      message: "Manifest for 'env1' is invalid: unknown.",
    })
  })

  it('passes a ValidationError through untouched rather than re-wrapping it', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    thrown = new ValidationError('already typed')
    await expect(loadManifest('env1')).rejects.toMatchObject({ message: 'already typed' })
  })
})
