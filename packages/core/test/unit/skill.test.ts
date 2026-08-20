import { execFile } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import Skill from '../../src/commands/skill.js'
import { readSkill, SKILL_PATH, skillName } from '../../src/skill.js'
import { skillArgv } from '../../bin/skill-flag.js'

const run = promisify(execFile)
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dev = path.join(pkgRoot, 'bin', 'dev.js')

describe('packaged agent skill', () => {
  it('resolves to skill/SKILL.md with valid frontmatter named dcw', () => {
    expect(SKILL_PATH.endsWith(path.join('skill', 'SKILL.md'))).toBe(true)
    const md = readSkill()
    expect(md.startsWith('---\nname: dcw\n')).toBe(true)
    expect(md).toMatch(/^description:/m)
    expect(skillName(md)).toBe('dcw')
  })

  it('documents how to (re)install itself via `dcw --skill`', () => {
    expect(readSkill()).toContain('dcw --skill >')
  })

  it('`skill` command is a raw pass-through (no JSON envelope) but tolerates --json', () => {
    expect(Skill.enableJsonFlag).toBe(false)
    expect(Skill.flags?.json).toBeDefined()
  })
})

describe('top-level --skill alias', () => {
  it('rewrites only a leading --skill into the skill command', () => {
    expect(skillArgv(['--skill'])).toEqual(['skill'])
    expect(skillArgv(['--skill', '--json'])).toEqual(['skill', '--json'])
    expect(skillArgv(['create', '--skill'])).toEqual(['create', '--skill'])
    expect(skillArgv([])).toEqual([])
  })

  it('`dcw --skill` prints the skill file verbatim and exits 0', async () => {
    const { stdout } = await run('node', ['--import', 'tsx', dev, '--skill'], { cwd: pkgRoot })
    expect(stdout).toBe(readSkill())
  }, 30_000)
})
