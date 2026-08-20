import { describe, expect, it, vi } from 'vitest'

// Drop one tool's install command while leaving it a recognized tool key: the
// state a catalog/INSTALL_COMMANDS mismatch would produce.
vi.mock('../../src/domain/install-commands.js', async (orig) => {
  const actual = await orig<typeof import('../../src/domain/install-commands.js')>()
  const { foundry, ...rest } = actual.INSTALL_COMMANDS as Record<string, string>
  return { ...actual, INSTALL_COMMANDS: rest }
})

const { generateContainerfile } = await import('../../src/containerfile/generate.js')

describe('generateContainerfile snippet lookup', () => {
  it('fails loudly rather than emitting an image missing a requested tool', async () => {
    expect(() => generateContainerfile({ selections: { frameworks: ['foundry'] }, ssh: false })).toThrow(
      "No install command for tool 'foundry'.",
    )
  })

  it('still generates cleanly for tools whose snippets are present', () => {
    expect(generateContainerfile({ selections: { coreLanguages: ['go'] }, ssh: false })).toContain('WORKDIR /workspace')
  })
})
