import { isToolKey, type ToolKey } from './install-commands.js'
import type { SelectionKey } from './catalog.js'

export type Selections = Partial<Record<SelectionKey, string[]>>

export interface ResolvedTools {
  /** All required tool keys (incl. `python`/`rust`/`go`/`node` markers), insertion-ordered & unique. */
  all: ToolKey[]
  /** Whether Python is required (installed inline by the generator). */
  needsPython: boolean
  /** Core runtimes present, in canonical install order: rust, go, node. */
  runtimes: ToolKey[]
  /** Non-runtime, non-python tools in insertion order (what the generator installs after runtimes). */
  tools: ToolKey[]
}

const CORE_RUNTIME_ORDER: ToolKey[] = ['rust', 'go', 'node']

/**
 * Resolve user selections into the full ordered set of tools to install.
 * Ported from the original generator's dependency-resolution logic.
 */
export function resolveTools(sel: Selections): ResolvedTools {
  const required = new Set<ToolKey>()

  for (const lang of sel.coreLanguages ?? []) {
    if (lang === 'rust') required.add('rust')
    else if (lang === 'python') required.add('python')
    else if (lang === 'go') required.add('go')
    else if (lang === 'node') required.add('node')
  }

  if (sel.languages?.includes('solidity')) {
    required.add('python')
    required.add('solc-select')
  }
  if (sel.languages?.includes('vyper')) {
    required.add('python')
    required.add('vyper')
  }

  for (const framework of sel.frameworks ?? []) {
    if (framework === 'foundry') {
      required.add('rust')
      required.add('foundry')
    } else if (framework === 'hardhat') {
      required.add('node')
      required.add('hardhat')
    } else if (framework === 'ape') {
      required.add('python')
      required.add('ape')
    }
  }

  for (const tool of sel.fuzzingAndTesting ?? []) {
    if (isToolKey(tool)) {
      required.add(tool)
      if (tool === 'echidna' || tool === 'medusa') required.add('go')
      if (tool === 'ityfuzz' || tool === 'aderyn') required.add('rust')
      if (tool === 'halmos') required.add('python')
    }
  }

  for (const tool of sel.securityTooling ?? []) {
    if (isToolKey(tool)) {
      required.add(tool)
      if (
        ['slither', 'mythril', 'crytic-compile', 'panoramix', 'slither-lsp', 'napalm-toolbox', 'semgrep', 'slitherin'].includes(
          tool,
        )
      ) {
        required.add('python')
      }
      if (tool === 'heimdall') required.add('rust')
    }
  }

  for (const agent of sel.aiAgents ?? []) {
    if (isToolKey(agent)) {
      required.add(agent)
      // claude/codex/opencode are all distributed as npm packages.
      required.add('node')
    }
  }

  const all = [...required]
  const runtimes = CORE_RUNTIME_ORDER.filter((r) => required.has(r))
  const skip = new Set<ToolKey>([...CORE_RUNTIME_ORDER, 'python'])
  // Tools other than runtimes/python, preserving insertion order.
  const tools = all.filter((t) => !skip.has(t))

  return {
    all,
    needsPython: required.has('python'),
    runtimes,
    tools,
  }
}
