import { describe, expect, it } from 'vitest'
import { flagsToSpec } from '../../src/spec/flags-to-spec.js'
import { ValidationError } from '../../src/errors.js'

describe('flagsToSpec', () => {
  it('builds a spec from selections', () => {
    const spec = flagsToSpec({ name: 'Audit Env', frameworks: ['foundry'], securityTooling: ['slither'] })
    expect(spec.name).toBe('audit-env') // slugified
    expect(spec.selections.frameworks).toEqual(['foundry'])
    expect(spec.engine).toBe('auto')
  })

  it('expands a profile into hardening keys', () => {
    const spec = flagsToSpec({ name: 'x', profile: 'hardened' })
    expect(spec.hardening).toContain('drop-caps')
    expect(spec.profile).toBe('hardened')
  })

  it('merges manual hardening with the profile', () => {
    const spec = flagsToSpec({ name: 'x', profile: 'development', hardening: ['network-none'] })
    expect(spec.hardening).toContain('network-none')
    expect(spec.hardening).toContain('apparmor')
  })

  it('normalizes legacy resource-limit aliases', () => {
    const spec = flagsToSpec({ name: 'x', hardening: ['resource-limits-medium'] })
    expect(spec.hardening).toContain('resource-limits-standard')
  })

  it('falls back to the cwd-derived name', () => {
    const spec = flagsToSpec({ fallbackName: 'My Project' })
    expect(spec.name).toBe('my-project')
  })

  it('captures git repository config', () => {
    const spec = flagsToSpec({ name: 'x', gitUrl: 'https://github.com/a/b', gitBranch: 'dev' })
    expect(spec.gitRepository).toEqual({ url: 'https://github.com/a/b', branch: 'dev', enabled: true })
  })

  it('accepts AI coding agent selections', () => {
    const spec = flagsToSpec({ name: 'x', aiAgents: ['claude', 'codex'] })
    expect(spec.selections.aiAgents).toEqual(['claude', 'codex'])
  })

  it('rejects unknown selection values', () => {
    expect(() => flagsToSpec({ name: 'x', frameworks: ['truffle'] })).toThrow(ValidationError)
  })

  it('rejects an unknown AI agent', () => {
    expect(() => flagsToSpec({ name: 'x', aiAgents: ['cursor'] })).toThrow(ValidationError)
  })

  it('rejects an unknown profile', () => {
    expect(() => flagsToSpec({ name: 'x', profile: 'nope' })).toThrow(ValidationError)
  })

  it('rejects unknown hardening keys', () => {
    expect(() => flagsToSpec({ name: 'x', hardening: ['make-it-secure'] })).toThrow(ValidationError)
  })

  it('requires a name', () => {
    expect(() => flagsToSpec({ frameworks: ['foundry'] })).toThrow(ValidationError)
  })

  it('rejects a name that slugs to a hidden/degenerate identifier (#7)', () => {
    // '...' / '.x' would otherwise produce hidden '....json' / '.x.json' manifests.
    expect(() => flagsToSpec({ name: '...' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: '.hidden' })).toThrow(ValidationError)
  })

  it('rejects a git url with shell metacharacters or newlines (#2)', () => {
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://x\nRUN echo pwned' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://x;rm -rf /' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://x$(whoami)' })).toThrow(ValidationError)
  })

  it('rejects a git branch with metacharacters or a leading dash (#2)', () => {
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://github.com/a/b', gitBranch: '-x; id' })).toThrow(
      ValidationError,
    )
  })

  it('accepts a clean git url + branch (#2)', () => {
    const spec = flagsToSpec({ name: 'x', gitUrl: 'https://github.com/org/repo.git', gitBranch: 'main' })
    expect(spec.gitRepository).toMatchObject({ url: 'https://github.com/org/repo.git', branch: 'main' })
  })

  it('rejects --git-branch without --git-url instead of silently dropping it (#N8)', () => {
    expect(() => flagsToSpec({ name: 'x', gitBranch: 'main' })).toThrow(ValidationError)
  })

  it('rejects an over-long name (#N2)', () => {
    expect(() => flagsToSpec({ name: 'a'.repeat(300) })).toThrow(ValidationError)
  })

  it('hints at --name when a derived dot-directory name is unusable (#bug4)', () => {
    // `create --no-input` in a `.config` dir derives a hidden slug the user can
    // only fix by naming the env explicitly — the message must say so.
    expect(() => flagsToSpec({ fallbackName: '.config' })).toThrow(/--name/)
    expect(() => flagsToSpec({ fallbackName: '.config' })).toThrow(ValidationError)
  })

  it('does not give the --name hint for an explicit bad name (#bug4)', () => {
    expect(() => flagsToSpec({ name: '.config' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: '.config' })).not.toThrow(/pass --name/)
  })

  it('dedupes repeated repeatable-flag values before persisting (#bug6)', () => {
    const spec = flagsToSpec({ name: 'x', coreLanguages: ['rust', 'rust', 'go', 'rust'] })
    expect(spec.selections.coreLanguages).toEqual(['rust', 'go'])
  })
})

describe('codex-security findings', () => {
  it('rejects credential-bearing (userinfo) scheme git urls (CS#5)', () => {
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://user:ghp_token@github.com/a/b' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'https://token@github.com/a/b' })).toThrow(ValidationError)
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'ssh://git@github.com/a/b' })).toThrow(ValidationError)
  })

  it('still accepts scp-style ssh remotes (user@ is a login, not a secret) (CS#5)', () => {
    const spec = flagsToSpec({ name: 'x', gitUrl: 'git@github.com:org/repo.git' })
    expect(spec.gitRepository?.url).toBe('git@github.com:org/repo.git')
  })
})
