import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Path to the packaged agent skill (`skill/SKILL.md`).
 *
 * Resolved relative to this module so it works both from `src/` (tsx dev
 * entry) and `dist/` (built) — each sits one level below the package root.
 */
export const SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'skill', 'SKILL.md')

/** Read the raw SKILL.md markdown (frontmatter included). */
export function readSkill(): string {
  return readFileSync(SKILL_PATH, 'utf8')
}

/** Parse the `name:` from the skill frontmatter, used to suggest an install path. */
export function skillName(markdown: string): string {
  const match = /^---\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(markdown)
  return match?.[1] ?? 'dcw'
}
