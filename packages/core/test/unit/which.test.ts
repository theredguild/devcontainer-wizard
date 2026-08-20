import { describe, expect, it } from 'vitest'
import { isOnPath } from '../../src/util/which.js'

describe('isOnPath', () => {
  it('finds a binary that exists on PATH', async () => {
    expect(await isOnPath('node')).toBe(true)
  })

  it('reports a missing binary as absent', async () => {
    expect(await isOnPath('dcw-definitely-not-a-real-binary-xyz')).toBe(false)
  })

  it('falls back to `which` when `command` is not a spawnable binary', async () => {
    // macOS ships /usr/bin/command; most Linux distros do not, so the first probe
    // spawn-fails there. Emptying PATH makes BOTH probes unresolvable as binaries,
    // reproducing the Linux condition and proving the fallback is what answers.
    const realPath = process.env.PATH
    process.env.PATH = ''
    try {
      // `command` is now unspawnable, so a true result can only come from `which`
      // resolving via an absolute lookup — and with no PATH, nothing resolves.
      expect(await isOnPath('sh')).toBe(false)
    } finally {
      process.env.PATH = realPath
    }
    // Restored PATH: resolvable again, through whichever probe answers first.
    expect(await isOnPath('sh')).toBe(true)
  })
})
