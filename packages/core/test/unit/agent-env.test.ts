import { describe, expect, it } from 'vitest'
import { parseEnvForwards } from '../../src/commands/agent.js'
import { ValidationError } from '../../src/errors.js'

describe('dcw agent --env (codex-security CS#4)', () => {
  it('forwards a bare NAME from the host environment', () => {
    expect(parseEnvForwards(['GITHUB_TOKEN'], { GITHUB_TOKEN: 'ghp_x' })).toEqual({ GITHUB_TOKEN: 'ghp_x' })
    expect(parseEnvForwards(['MISSING'], {})).toEqual({})
  })

  it('rejects inline NAME=value without echoing the value', () => {
    let err: unknown
    try {
      parseEnvForwards(['GITHUB_TOKEN=ghp_supersecret'], {})
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as Error).message).not.toContain('ghp_supersecret')
    expect((err as Error).message).toContain('GITHUB_TOKEN')
  })

  it('rejects empty and malformed names', () => {
    expect(() => parseEnvForwards(['=x'], {})).toThrow(ValidationError)
    expect(() => parseEnvForwards([''], {})).toThrow(ValidationError)
    expect(() => parseEnvForwards(['BAD NAME'], {})).toThrow(ValidationError)
  })
})
