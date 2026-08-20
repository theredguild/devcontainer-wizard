/**
 * Best-effort install wrapping.
 *
 * Leaf-tool install snippets are made non-fatal: each `RUN` is wrapped so a
 * failure records `<tool>=fail` to the in-image report and continues the build,
 * rather than aborting it. Non-RUN directives (ENV, WORKDIR, USER, COPY) are
 * left untouched. Core runtimes are NOT wrapped — a failed runtime is a real
 * problem and should fail fast.
 */

export const REPORT_PATH = '/home/vscode/.dcw/report'

interface Instruction {
  isRun: boolean
  lines: string[]
}

const DIRECTIVES = ['RUN', 'ENV', 'WORKDIR', 'USER', 'COPY', 'ADD', 'ARG', 'LABEL', 'SHELL', 'ENTRYPOINT', 'CMD', 'FROM']

function startsInstruction(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return false
  // `split(re, 1).join('')` yields the first token without an indexed access, so
  // there is no unreachable `?? ''` arm to satisfy noUncheckedIndexedAccess with.
  const first = trimmed.split(/\s+/, 1).join('')
  return DIRECTIVES.includes(first)
}

/** Split a snippet into Dockerfile instructions, honoring `\` line continuations. */
export function parseInstructions(text: string): Instruction[] {
  const lines = text.split('\n')
  const out: Instruction[] = []
  let current: Instruction | null = null
  let continuing = false

  for (const line of lines) {
    if (continuing && current) {
      current.lines.push(line)
    } else if (startsInstruction(line)) {
      current = { isRun: line.trim().startsWith('RUN'), lines: [line] }
      out.push(current)
    } else {
      // comment / blank / stray line → passthrough chunk
      out.push({ isRun: false, lines: [line] })
      current = null
    }
    continuing = line.trimEnd().endsWith('\\')
  }
  return out
}

/** Wrap every RUN in a tool's snippet so failures are recorded but non-fatal. */
export function guardToolSnippet(tool: string, snippet: string): string {
  const okEcho = `echo "${tool}=ok" >> ${REPORT_PATH}`
  const failEcho = `{ echo "${tool}=fail" >> ${REPORT_PATH}; echo "dcw: ${tool} install failed (continuing)" >&2; }`

  return parseInstructions(snippet)
    .map((inst) => {
      if (!inst.isRun) return inst.lines.join('\n')
      const lines = [...inst.lines]
      // Open a subshell right after RUN on the first line.
      lines[0] = lines[0]!.replace(/^(\s*)RUN\s+/, '$1RUN ( ')
      // Close the subshell and append the success/failure guard on the last line.
      const last = lines.length - 1
      lines[last] = `${lines[last]} ) && ${okEcho} || ${failEcho}`
      return lines.join('\n')
    })
    .join('\n')
}
