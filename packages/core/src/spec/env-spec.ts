import { z } from 'zod'
import { validValuesFor } from '../domain/catalog.js'
import { HARDENING_KEYS } from '../domain/hardening.js'
import { ALL_ENGINES } from '../engine/types.js'

function enumArray(values: string[]) {
  return z.array(z.enum(values as [string, ...string[]]))
}

/**
 * A git remote: either a scheme URL (http/https/git/ssh) or scp-style
 * `user@host:path`. The character class deliberately excludes whitespace and
 * shell metacharacters so the value can't break out of the `RUN git clone`
 * line in the generated Containerfile (build-time RCE). Scheme URLs also
 * restrict `@`: `https://user:token@host/...` userinfo would be persisted in
 * cleartext into the manifest, the Containerfile and the image's
 * remote.origin.url, so http(s) forbids `@` outright. `ssh://` and `git://`
 * allow a bare `user@` login (the canonical `ssh://git@github.com/o/r.git`
 * form this error message itself recommends) but not `user:password@`, since
 * the userinfo pattern excludes `:`. The `user@` in scp-style remotes is an
 * SSH login, not a secret, and is likewise allowed.
 */
// `%` is excluded from every branch: git percent-decodes URL userinfo, so
// `ssh://user%3Apass%40host/repo` passes a naive character check and is then handed
// to ssh as `user:pass@host` — smuggling the credentials the rules below forbid
// straight into the manifest and the generated Containerfile. No legitimate remote
// dcw supports needs percent-encoding.
const GIT_URL_RE =
  /^(?:https?:\/\/[^\s;`$(){}<>|&'"\\@%]+|(?:git|ssh):\/\/(?:[A-Za-z0-9._-]+@)?[^\s;`$(){}<>|&'"\\@%]+|[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[A-Za-z0-9._/~-]+)$/
/** A safe git ref (branch/tag): no whitespace, no leading dash, no metacharacters. */
const GIT_BRANCH_RE = /^(?!-)[A-Za-z0-9._/-]+$/

export const GitRepositorySchema = z.object({
  url: z
    .string()
    .min(1)
    .regex(GIT_URL_RE, 'must be an http(s)/git/ssh URL or scp-style remote with no spaces, shell metacharacters or embedded credentials (user:token@host); use SSH or a credential helper for private repos'),
  branch: z
    .string()
    .regex(GIT_BRANCH_RE, 'must be a valid git ref (letters, digits, ., _, /, -; no leading dash)')
    .optional(),
  enabled: z.boolean(),
})

export const SelectionsSchema = z
  .object({
    coreLanguages: enumArray(validValuesFor('coreLanguages')).optional(),
    languages: enumArray(validValuesFor('languages')).optional(),
    frameworks: enumArray(validValuesFor('frameworks')).optional(),
    fuzzingAndTesting: enumArray(validValuesFor('fuzzingAndTesting')).optional(),
    securityTooling: enumArray(validValuesFor('securityTooling')).optional(),
    aiAgents: enumArray(validValuesFor('aiAgents')).optional(),
  })
  .strict()

/**
 * The authored environment specification — produced identically by the ink
 * wizard and the non-interactive flag path, and persisted inside the manifest.
 */
export const EnvSpecSchema = z
  .object({
    name: z.string().min(1),
    engine: z.enum(['auto', ...ALL_ENGINES] as [string, ...string[]]).default('auto'),
    selections: SelectionsSchema.default({}),
    /** Normalized hardening keys (after any profile expansion). */
    hardening: enumArray(HARDENING_KEYS).default([]),
    /** Profile(s) the hardening was derived from, for display only. */
    profile: z.string().optional(),
    gitRepository: GitRepositorySchema.optional(),
    /** Bake an SSH server into the image for editor attach (`dcw attach`). */
    ssh: z.boolean().default(true),
  })
  .strict()

export type EnvSpec = z.infer<typeof EnvSpecSchema>
export type GitRepository = z.infer<typeof GitRepositorySchema>
