import { describe, expect, it } from 'vitest'
import * as api from '../../src/index.js'
import { BaseCommand } from '../../src/base-command.js'
import { SKILL_PATH, readSkill, skillName } from '../../src/skill.js'

describe('package entry point', () => {
  it('re-exports BaseCommand as the public API surface', () => {
    expect(Object.keys(api)).toEqual(['BaseCommand'])
    expect(api.BaseCommand).toBe(BaseCommand)
  })
})

describe('skill loader', () => {
  it('resolves SKILL.md relative to the module, so it works from src/ and dist/', () => {
    expect(SKILL_PATH.endsWith('/skill/SKILL.md')).toBe(true)
    expect(readSkill()).toContain('name: dcw')
  })

  it('reads the skill name out of the frontmatter', () => {
    expect(skillName(readSkill())).toBe('dcw')
    expect(skillName('---\nname: custom\ndescription: x\n---\nbody')).toBe('custom')
  })

  it("falls back to 'dcw' when there is no parseable frontmatter name", () => {
    expect(skillName('no frontmatter here')).toBe('dcw')
    expect(skillName('---\ndescription: x\n---\n')).toBe('dcw')
  })
})
