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
    // A password in ssh:// userinfo is still a secret and stays rejected.
    expect(() => flagsToSpec({ name: 'x', gitUrl: 'ssh://git:hunter2@github.com/a/b' })).toThrow(ValidationError)
  })

  it('accepts a bare ssh:// login, consistent with the scp-style form below (CS#5)', () => {
    // `ssh://git@host/o/r` and `git@host:o/r` are the same remote written two ways;
    // in both, `git@` is an SSH *login*, not a credential. Rejecting only the URL
    // form was inconsistent, and blocked the very form the validation error
    // recommends ("use SSH ... for private repos").
    expect(flagsToSpec({ name: 'x', gitUrl: 'ssh://git@github.com/a/b' }).gitRepository?.url).toBe(
      'ssh://git@github.com/a/b',
    )
  })

  it('still accepts scp-style ssh remotes (user@ is a login, not a secret) (CS#5)', () => {
    const spec = flagsToSpec({ name: 'x', gitUrl: 'git@github.com:org/repo.git' })
    expect(spec.gitRepository?.url).toBe('git@github.com:org/repo.git')
  })
})

describe('git remote URL validation', () => {
  const accept = (url: string) => flagsToSpec({ name: 'x', gitUrl: url }).gitRepository?.url
  const reject = (url: string) => expect(() => flagsToSpec({ name: 'x', gitUrl: url })).toThrow()

  it('accepts the canonical ssh:// form with an SSH login', () => {
    // The error message tells users to "use SSH" for private repos, so the
    // canonical ssh://git@host/path form must not be rejected.
    expect(accept('ssh://git@github.com/foo/bar.git')).toBe('ssh://git@github.com/foo/bar.git')
  })

  it('accepts scp-style and plain https remotes', () => {
    expect(accept('git@github.com:foo/bar.git')).toBe('git@github.com:foo/bar.git')
    expect(accept('https://github.com/foo/bar.git')).toBe('https://github.com/foo/bar.git')
  })

  it('still rejects embedded credentials in any scheme', () => {
    reject('https://user:token@github.com/foo/bar.git')
    reject('ssh://user:password@host/foo.git')
    reject('https://user@github.com/foo/bar.git')
  })

  it('still rejects shell metacharacters and whitespace', () => {
    reject('https://github.com/a/b.git;touch /pwned')
    reject('https://github.com/a/b.git $(id)')
    reject('ssh://git@host/`id`')
  })
})

describe('default hardening posture', () => {
  it('applies the development profile when nothing was requested', () => {
    // A bare `dcw create` must never produce a completely unhardened environment:
    // no capability drops, no no-new-privs and no secure tmpfs, with --strict
    // passing vacuously because nothing was asked for.
    const spec = flagsToSpec({ name: 'x' })
    expect(spec.profile).toBe('development')
    expect(spec.hardening).toContain('no-new-privs')
    expect(spec.hardening).toContain('secure-tmp')
    expect(spec.hardening.length).toBeGreaterThan(0)
  })

  it('honours an explicit --profile none as a deliberate opt-out', () => {
    const spec = flagsToSpec({ name: 'x', profile: 'none' })
    expect(spec.hardening).toEqual([])
    expect(spec.profile).toBe('none')
  })

  it('does not silently add the default on top of explicit --harden keys', () => {
    // Naming hardening keys is itself a deliberate choice; merging `development`
    // into it would apply controls the user did not ask for.
    const spec = flagsToSpec({ name: 'x', hardening: ['drop-caps'] })
    expect(spec.hardening).toEqual(['drop-caps'])
    expect(spec.profile).toBeUndefined()
  })

  it('leaves an explicit profile alone', () => {
    const spec = flagsToSpec({ name: 'x', profile: 'paranoid' })
    expect(spec.profile).toBe('paranoid')
    expect(spec.hardening).toContain('readonly-os')
  })

  it('still rejects an unknown profile', () => {
    expect(() => flagsToSpec({ name: 'x', profile: 'bogus' })).toThrow(ValidationError)
  })
})
