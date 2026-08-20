import { describe, expect, it, vi } from 'vitest'
import Skill from '../../src/commands/skill.js'
import { readSkill } from '../../src/skill.js'
import { runCommand } from '../helpers/command.js'

describe('dcw skill', () => {
  it('writes the packaged SKILL.md verbatim to stdout', async () => {
    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk))
      return true
    })
    try {
      await runCommand(Skill, {})
    } finally {
      spy.mockRestore()
    }
    expect(written.join('')).toBe(readSkill())
    // Raw markdown pass-through: no JSON envelope, no trailing framework noise.
    expect(written.join('')).toContain('dcw')
  })
})
