import { describe, expect, it } from 'vitest'
import { INSTALL_COMMANDS } from '../../src/domain/install-commands.js'

describe('install snippets', () => {
  it('medusa emits a correct git-describe suffix-stripping sed (#11)', () => {
    // The non-raw template previously collapsed \+ and \w, breaking the regex.
    expect(INSTALL_COMMANDS.medusa).toContain("sed 's/-[0-9]\\+-g\\w\\+$//'")
    // …and uses real backslash-newline line continuations (not collapsed away).
    expect(INSTALL_COMMANDS.medusa).toMatch(/&& \\\n/)
  })

  it('heimdall/echidna do not self-mask install failures (#13)', () => {
    expect(INSTALL_COMMANDS.heimdall).not.toContain("|| echo 'Heimdall installed'")
    expect(INSTALL_COMMANDS.echidna).not.toContain('|| echo')
  })

  it('aderyn keeps its legitimate command fallback (#13)', () => {
    expect(INSTALL_COMMANDS.aderyn).toContain('|| cyfrinup')
  })
})
