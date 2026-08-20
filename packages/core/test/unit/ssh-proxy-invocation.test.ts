import { describe, expect, it } from 'vitest'
import { resolveDcwInvocation } from '../../src/core/ssh/attach.js'

describe('resolveDcwInvocation (#N6 — ProxyCommand quoting)', () => {
  it('shell-quotes node/entry paths when falling back to the local install', async () => {
    // `command -v dcw` is a shell builtin with no binary on PATH, so capture()
    // spawn-fails and we take the `<node> <entry>` fallback branch.
    const inv = await resolveDcwInvocation('my-env')
    expect(inv).toContain('ssh-proxy my-env')
    if (!inv.startsWith('dcw ')) {
      // Fallback form: every path component is single-quoted so spaces don't split.
      expect(inv).toMatch(/^'.*' '.*' ssh-proxy my-env$/)
    }
  })
})
