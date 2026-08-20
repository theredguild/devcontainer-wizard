import { describe, expect, it } from 'vitest'
import { DockerDriver } from '../../src/engine/drivers/docker.js'
import type { ExecSpec } from '../../src/engine/types.js'

/** Expose the protected argv builder for assertion. */
class ProbeDriver extends DockerDriver {
  argvFor(spec: ExecSpec): string[] {
    return this.execArgv(spec)
  }
}

describe('execArgv secret handling (#10)', () => {
  it('passes -e NAME value-less so secrets never land in argv', () => {
    const argv = new ProbeDriver().argvFor({
      container: 'c1',
      cmd: ['true'],
      interactive: false,
      tty: false,
      env: { ANTHROPIC_API_KEY: 'sk-super-secret' },
    })
    expect(argv).toContain('-e')
    expect(argv).toContain('ANTHROPIC_API_KEY')
    expect(argv).not.toContain('ANTHROPIC_API_KEY=sk-super-secret')
    expect(argv.join(' ')).not.toContain('sk-super-secret')
  })
})
