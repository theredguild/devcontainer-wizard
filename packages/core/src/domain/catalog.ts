/**
 * Catalog of user-selectable environment options, grouped by category.
 * Drives the wizard, the non-interactive flags, the `schema` command, and
 * dependency resolution. Values mirror the original wizard's vocabulary.
 */

export interface CatalogItem {
  value: string
  label: string
  description: string
}

export interface CatalogCategory {
  key: SelectionKey
  title: string
  /** Whether multiple items may be selected (all current categories are multi). */
  multi: boolean
  items: CatalogItem[]
}

export type SelectionKey =
  | 'coreLanguages'
  | 'languages'
  | 'frameworks'
  | 'fuzzingAndTesting'
  | 'securityTooling'
  | 'aiAgents'

export const CORE_LANGUAGES: CatalogItem[] = [
  { value: 'rust', label: 'Rust', description: 'Rust toolchain via rustup.' },
  { value: 'python', label: 'Python', description: 'Python 3.12 via uv.' },
  { value: 'go', label: 'Go', description: 'Latest Go via asdf.' },
  { value: 'node', label: 'Node.js', description: 'Node + pnpm via the devcontainers install script.' },
]

export const LANGUAGES: CatalogItem[] = [
  { value: 'solidity', label: 'Solidity', description: 'solc-select with multiple solc versions (pulls Python).' },
  { value: 'vyper', label: 'Vyper', description: 'Vyper compiler via uv (pulls Python).' },
]

export const FRAMEWORKS: CatalogItem[] = [
  { value: 'foundry', label: 'Foundry', description: 'forge/cast/anvil (pulls Rust).' },
  { value: 'hardhat', label: 'Hardhat', description: 'Hardhat dev environment (pulls Node).' },
  { value: 'ape', label: 'Ape', description: 'ApeWorX framework (pulls Python).' },
]

export const FUZZING_AND_TESTING: CatalogItem[] = [
  { value: 'echidna', label: 'Echidna', description: 'Property-based fuzzer (multi-stage copy).' },
  { value: 'medusa', label: 'Medusa', description: 'Parallel fuzzer (pulls Go).' },
  { value: 'halmos', label: 'Halmos', description: 'Symbolic testing (pulls Python).' },
  { value: 'ityfuzz', label: 'ItyFuzz', description: 'Snapshot-based fuzzer (pulls Rust).' },
  { value: 'aderyn', label: 'Aderyn', description: 'Cyfrin static analyzer (pulls Rust).' },
]

export const SECURITY_TOOLING: CatalogItem[] = [
  { value: 'slither', label: 'Slither', description: 'Static analysis framework (pulls Python).' },
  { value: 'mythril', label: 'Mythril', description: 'Symbolic execution analyzer (pulls Python).' },
  { value: 'crytic-compile', label: 'crytic-compile', description: 'Compilation helper (pulls Python).' },
  { value: 'panoramix', label: 'Panoramix', description: 'Decompiler (pulls Python).' },
  { value: 'slither-lsp', label: 'Slither LSP', description: 'Slither language server (pulls Python).' },
  { value: 'napalm-toolbox', label: 'Napalm', description: 'Napalm toolbox (pulls Python).' },
  { value: 'semgrep', label: 'Semgrep', description: 'Pattern-based static analysis (pulls Python).' },
  { value: 'slitherin', label: 'Slitherin', description: 'Extra Slither detectors (pulls Python).' },
  { value: 'heimdall', label: 'Heimdall', description: 'EVM toolkit / decompiler (pulls Rust).' },
]

export const AI_AGENTS: CatalogItem[] = [
  { value: 'claude', label: 'Claude Code', description: 'Anthropic Claude Code CLI (pulls Node).' },
  { value: 'codex', label: 'Codex', description: 'OpenAI Codex CLI (pulls Node).' },
  { value: 'opencode', label: 'opencode', description: 'opencode multi-provider agent CLI (pulls Node).' },
]

export const CATALOG: CatalogCategory[] = [
  { key: 'coreLanguages', title: 'Core languages', multi: true, items: CORE_LANGUAGES },
  { key: 'languages', title: 'Smart-contract languages', multi: true, items: LANGUAGES },
  { key: 'frameworks', title: 'Frameworks', multi: true, items: FRAMEWORKS },
  { key: 'fuzzingAndTesting', title: 'Fuzzing & testing', multi: true, items: FUZZING_AND_TESTING },
  { key: 'securityTooling', title: 'Security tooling', multi: true, items: SECURITY_TOOLING },
  { key: 'aiAgents', title: 'AI coding agents', multi: true, items: AI_AGENTS },
]

export function validValuesFor(key: SelectionKey): string[] {
  return CATALOG.find((c) => c.key === key)?.items.map((i) => i.value) ?? []
}
