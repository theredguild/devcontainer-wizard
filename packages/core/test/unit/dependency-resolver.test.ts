import { describe, expect, it } from 'vitest'
import { resolveTools } from '../../src/domain/dependency-resolver.js'

describe('resolveTools', () => {
  it('pulls rust for foundry', () => {
    const r = resolveTools({ frameworks: ['foundry'] })
    expect(r.all).toContain('rust')
    expect(r.all).toContain('foundry')
    expect(r.runtimes).toEqual(['rust'])
    expect(r.tools).toContain('foundry')
  })

  it('pulls node for hardhat', () => {
    const r = resolveTools({ frameworks: ['hardhat'] })
    expect(r.all).toEqual(expect.arrayContaining(['node', 'hardhat']))
  })

  it('pulls python + solc-select for solidity', () => {
    const r = resolveTools({ languages: ['solidity'] })
    expect(r.needsPython).toBe(true)
    expect(r.all).toContain('solc-select')
  })

  it('pulls go for echidna and medusa', () => {
    expect(resolveTools({ fuzzingAndTesting: ['echidna'] }).all).toContain('go')
    expect(resolveTools({ fuzzingAndTesting: ['medusa'] }).all).toContain('go')
  })

  it('pulls rust for ityfuzz, aderyn, heimdall', () => {
    expect(resolveTools({ fuzzingAndTesting: ['ityfuzz'] }).all).toContain('rust')
    expect(resolveTools({ fuzzingAndTesting: ['aderyn'] }).all).toContain('rust')
    expect(resolveTools({ securityTooling: ['heimdall'] }).all).toContain('rust')
  })

  it('pulls python for halmos and slither family', () => {
    expect(resolveTools({ fuzzingAndTesting: ['halmos'] }).needsPython).toBe(true)
    expect(resolveTools({ securityTooling: ['slither'] }).needsPython).toBe(true)
    expect(resolveTools({ securityTooling: ['panoramix'] }).needsPython).toBe(true)
  })

  it('does NOT add a VS Code extension for panoramix (editor-agnostic)', () => {
    const r = resolveTools({ securityTooling: ['panoramix'] })
    expect(r.all).not.toContain('tintinweb.vscode-decompiler')
    // every key must be a real install command
    for (const t of r.all) expect(t).not.toContain('vscode')
  })

  it('orders runtimes rust, go, node and excludes python/runtimes from tools', () => {
    const r = resolveTools({ coreLanguages: ['node', 'go', 'rust', 'python'], frameworks: ['foundry'] })
    expect(r.runtimes).toEqual(['rust', 'go', 'node'])
    expect(r.tools).not.toContain('python')
    expect(r.tools).not.toContain('rust')
    expect(r.tools).toContain('foundry')
  })

  it('dedupes when multiple selections require the same runtime', () => {
    const r = resolveTools({ coreLanguages: ['rust'], frameworks: ['foundry'], fuzzingAndTesting: ['ityfuzz'] })
    expect(r.all.filter((t) => t === 'rust')).toHaveLength(1)
  })

  it('pulls node for AI coding agents', () => {
    const r = resolveTools({ aiAgents: ['claude'] })
    expect(r.all).toEqual(expect.arrayContaining(['node', 'claude']))
    expect(r.runtimes).toEqual(['node'])
    expect(r.tools).toContain('claude')
  })

  it('resolves all three AI agents', () => {
    const r = resolveTools({ aiAgents: ['claude', 'codex', 'opencode'] })
    expect(r.all).toEqual(expect.arrayContaining(['claude', 'codex', 'opencode', 'node']))
    // node pulled once despite three agents requiring it
    expect(r.all.filter((t) => t === 'node')).toHaveLength(1)
  })

  it('returns empty for no selections', () => {
    const r = resolveTools({})
    expect(r.all).toEqual([])
    expect(r.needsPython).toBe(false)
  })
})
