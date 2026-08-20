import { describe, expect, it } from 'vitest'
import { guardToolSnippet, parseInstructions, REPORT_PATH } from '../../src/containerfile/guard.js'
import { parseToolReport } from '../../src/core/build-pipeline.js'
import { generateContainerfile } from '../../src/containerfile/generate.js'

describe('parseInstructions', () => {
  it('groups RUN continuations and separates ENV', () => {
    const snippet = 'RUN a && \\\n    b\nENV X=1\nRUN c'
    const inst = parseInstructions(snippet)
    expect(inst.map((i) => i.isRun)).toEqual([true, false, true])
    expect(inst[0]!.lines).toHaveLength(2)
  })
})

describe('guardToolSnippet', () => {
  it('wraps each RUN with a success/failure recorder and leaves ENV alone', () => {
    const out = guardToolSnippet('heimdall', 'RUN install-it\nENV PATH=/x:$PATH')
    expect(out).toContain('RUN ( install-it ) &&')
    expect(out).toContain(`heimdall=ok" >> ${REPORT_PATH}`)
    expect(out).toContain(`heimdall=fail" >> ${REPORT_PATH}`)
    expect(out).toContain('ENV PATH=/x:$PATH')
  })

  it('keeps multi-line RUN bodies intact inside the subshell', () => {
    const out = guardToolSnippet('medusa', 'RUN one && \\\n    two')
    expect(out).toContain('RUN ( one && \\')
    expect(out).toContain('    two ) &&')
  })
})

describe('parseToolReport', () => {
  it('marks a tool failed if any line says fail', () => {
    const report = parseToolReport('rust=ok\nmedusa=ok\nmedusa=fail\nslither=ok')
    expect(report).toEqual([
      { name: 'medusa', ok: false },
      { name: 'rust', ok: true },
      { name: 'slither', ok: true },
    ])
  })
})

describe('generateContainerfile (best-effort + shim)', () => {
  it('keeps runtimes fail-fast but guards leaf tools', () => {
    const cf = generateContainerfile({ selections: { coreLanguages: ['rust'], frameworks: ['foundry'] } })
    // runtime (rust) is NOT guarded
    expect(cf).toContain('RUN curl --proto')
    expect(cf).not.toContain('rust=ok')
    // leaf tool (foundry) IS guarded
    expect(cf).toContain('foundry=ok')
    expect(cf).toContain('foundry=fail')
  })

  it('injects the libssl1.1 shim before ityfuzz', () => {
    const cf = generateContainerfile({ selections: { fuzzingAndTesting: ['ityfuzz'] } })
    expect(cf).toContain('libssl1.1_1.1.1w')
    expect(cf.indexOf('libssl1.1_1.1.1w')).toBeLessThan(cf.indexOf('ity.fuzz.land'))
    // shim is also guarded under the ityfuzz tool
    expect(cf).toContain('ityfuzz=fail')
  })

  it('prints the report only when leaf tools exist', () => {
    expect(generateContainerfile({ selections: { coreLanguages: ['rust'] } })).not.toContain('tool install report')
    expect(generateContainerfile({ selections: { frameworks: ['foundry'] } })).toContain('tool install report')
  })
})

describe('assertCloneSafe — option-injection defense in depth', () => {
  it('rejects a leading-dash value that git would read as an option', () => {
    // `git clone --upload-pack=... <url>` is a build-time RCE primitive. The zod
    // schema blocks this at the CLI boundary, but this guard bills itself as the
    // last line of defense before the value is spliced into an unquoted RUN line.
    expect(() =>
      generateContainerfile({
        selections: {},
        gitRepository: { url: '--upload-pack=touch/pwned', enabled: true },
      }),
    ).toThrow(/unsafe/i)
  })

  it('rejects a leading-dash branch too', () => {
    expect(() =>
      generateContainerfile({
        selections: {},
        gitRepository: { url: 'https://github.com/a/b.git', branch: '--upload-pack=x', enabled: true },
      }),
    ).toThrow(/unsafe/i)
  })

  it('still accepts a normal repo + branch', () => {
    const out = generateContainerfile({
      selections: {},
      gitRepository: { url: 'https://github.com/a/b.git', branch: 'main', enabled: true },
    })
    expect(out).toContain('git clone --branch main https://github.com/a/b.git')
  })
})
