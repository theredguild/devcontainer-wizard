import { resolveTools, type Selections } from '../domain/dependency-resolver.js'
import { INSTALL_COMMANDS } from '../domain/install-commands.js'
import {
  BASE_IMAGE,
  ECHIDNA_STAGE,
  PYTHON_APT,
  SHELL_ZSH,
  SSHD_SETUP,
  SYNTAX_DIRECTIVES,
  USER_ENV,
  UV_INSTALL,
} from './base.js'
import { guardToolSnippet, REPORT_PATH } from './guard.js'
import { PRE_INSTALL_SHIMS } from './shims.js'

export interface GitRepository {
  url: string
  branch?: string
  enabled: boolean
}

/** Reject a value that would break out of the unquoted `RUN git clone` line. */
function assertCloneSafe(label: string, value: string): void {
  if (/[\s;`$(){}<>|&'"\\]/.test(value)) {
    throw new Error(`Refusing to generate Containerfile: ${label} contains unsafe characters.`)
  }
}

export interface ContainerfileInput {
  selections: Selections
  gitRepository?: GitRepository
  /** Install an SSH server for editor attach (default true). */
  ssh?: boolean
}

/**
 * Generate a Containerfile (Dockerfile) for a plain-Debian, shell-first image.
 * Assembles base fragments + per-tool snippets in the canonical install order:
 * runtimes (rust, go, node) → python (inline uv) → remaining tools.
 */
export function generateContainerfile(input: ContainerfileInput): string {
  const resolved = resolveTools(input.selections)
  const lines: string[] = []

  lines.push(...SYNTAX_DIRECTIVES, '')

  if (resolved.all.includes('echidna')) {
    lines.push(...ECHIDNA_STAGE)
  }

  lines.push(...BASE_IMAGE, '')

  if (resolved.needsPython) {
    lines.push(...PYTHON_APT, '')
  }

  lines.push(...USER_ENV, '')

  // SSH server for editor attach (rootless). Enabled unless explicitly disabled.
  if (input.ssh !== false) {
    lines.push(...SSHD_SETUP, '')
  }

  if (resolved.needsPython) {
    lines.push(...UV_INSTALL, '')
  }

  lines.push(...SHELL_ZSH, '')

  // Core runtimes first (rust, go, node) — fail-fast, foundational. Python is inline above.
  for (const runtime of resolved.runtimes) {
    lines.push(snippet(runtime), '')
  }

  // Leaf tools are best-effort: a failed install records `<tool>=fail` and the
  // build continues (runtimes already succeeded). Optional compat shims first.
  for (const tool of resolved.tools) {
    lines.push(`# Install ${tool} (best-effort)`)
    const shim = PRE_INSTALL_SHIMS[tool]
    if (shim) lines.push(guardToolSnippet(tool, shim))
    lines.push(guardToolSnippet(tool, snippet(tool)), '')
  }

  if (resolved.all.includes('echidna')) {
    lines.push(
      'USER root',
      '# Copy Echidna binary from the echidna stage',
      'COPY --from=echidna /usr/local/bin/echidna /usr/local/bin/echidna',
      'RUN chmod 755 /usr/local/bin/echidna',
      'USER vscode',
      '',
    )
  }

  if (input.gitRepository?.enabled && input.gitRepository.url) {
    // Defense in depth: the schema already validates these, but never splice a
    // value carrying a newline or shell metacharacter into the RUN line.
    assertCloneSafe('git url', input.gitRepository.url)
    if (input.gitRepository.branch) assertCloneSafe('git branch', input.gitRepository.branch)
    const branch = input.gitRepository.branch ? `--branch ${input.gitRepository.branch} ` : ''
    lines.push(
      '# Clone git repository',
      'RUN mkdir -p /home/vscode/repos \\',
      `      && git clone ${branch}${input.gitRepository.url} /home/vscode/repos/project \\`,
      '      && sudo chown -R vscode:vscode /home/vscode/repos',
      '',
    )
  }

  const hasLeafTools = resolved.tools.length > 0
  lines.push(
    '# Final setup',
    "RUN echo 'Development environment ready!' && \\",
    "    echo 'Tools installed:' && \\",
    '    ls -la $HOME/.local/bin/ || true',
    '',
  )
  if (hasLeafTools) {
    lines.push(
      '# Tool install report (best-effort installs)',
      `RUN echo '--- dcw tool install report ---' && cat ${REPORT_PATH} 2>/dev/null || true`,
      '',
    )
  }
  lines.push('WORKDIR /workspace', '')

  return lines.join('\n')
}

function snippet(tool: string): string {
  const value = INSTALL_COMMANDS[tool as keyof typeof INSTALL_COMMANDS]
  if (value === undefined) {
    throw new Error(`No install command for tool '${tool}'.`)
  }
  // Trim the leading/trailing blank lines that the template literals carry.
  return value.replace(/^\n+/, '').replace(/\s+$/, '')
}
