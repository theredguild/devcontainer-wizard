import { describe, expect, it } from 'vitest'
import { isValidEnvName, MAX_ENV_NAME_LENGTH, slugify } from '../../src/util/slug.js'
import { resolveEnvName } from '../../src/cli/context.js'
import { ValidationError } from '../../src/errors.js'

describe('isValidEnvName', () => {
  it('accepts canonical slugs', () => {
    for (const name of ['my-env', 'audit', 'a.b_c-1', 'default']) {
      expect(isValidEnvName(name), name).toBe(true)
    }
  })

  it('rejects traversal, non-canonical, and hidden-file names', () => {
    for (const name of ['../../VICTIM', '../foo', 'My Env', 'My/Env', '...', '.hidden', 'UPPER', '@@@']) {
      expect(isValidEnvName(name), name).toBe(false)
    }
  })

  it('is consistent with slugify for accepted names', () => {
    expect(isValidEnvName(slugify('My Env'))).toBe(true)
  })

  it('bounds the name length (#N2)', () => {
    expect(isValidEnvName('a'.repeat(MAX_ENV_NAME_LENGTH))).toBe(true)
    expect(isValidEnvName('a'.repeat(MAX_ENV_NAME_LENGTH + 1))).toBe(false)
  })
})

describe('resolveEnvName (#1 — path-traversal guard)', () => {
  it('rejects a traversal positional name before touching the filesystem', async () => {
    await expect(resolveEnvName('../../VICTIM')).rejects.toBeInstanceOf(ValidationError)
  })

  it('passes through a valid positional name', async () => {
    expect(await resolveEnvName('my-env')).toBe('my-env')
  })
})
