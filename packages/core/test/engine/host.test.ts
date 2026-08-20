import { describe, expect, it } from 'vitest'
import { enginePlatformSupport, enginePreference, type HostInfo } from '../../src/engine/host.js'

const macSilicon: HostInfo = { os: 'macos', arch: 'arm64', macosMajor: 15 }
const macIntel: HostInfo = { os: 'macos', arch: 'x64', macosMajor: 14 }
const macOld: HostInfo = { os: 'macos', arch: 'arm64', macosMajor: 14 }
const linux: HostInfo = { os: 'linux', arch: 'x64' }
const windows: HostInfo = { os: 'windows', arch: 'x64' }

describe('enginePlatformSupport', () => {
  it('supports docker/podman everywhere', () => {
    for (const host of [macSilicon, linux, windows]) {
      expect(enginePlatformSupport('docker', host).supported).toBe(true)
      expect(enginePlatformSupport('podman', host).supported).toBe(true)
    }
  })

  it('limits orbstack to macOS', () => {
    expect(enginePlatformSupport('orbstack', macSilicon).supported).toBe(true)
    expect(enginePlatformSupport('orbstack', linux).supported).toBe(false)
  })

  it('limits lima to macOS and linux', () => {
    expect(enginePlatformSupport('lima', macSilicon).supported).toBe(true)
    expect(enginePlatformSupport('lima', linux).supported).toBe(true)
    expect(enginePlatformSupport('lima', windows).supported).toBe(false)
  })

  it('limits apple-container to macOS 15+ on Apple Silicon', () => {
    expect(enginePlatformSupport('apple-container', macSilicon).supported).toBe(true)
    expect(enginePlatformSupport('apple-container', linux).supported).toBe(false)
    expect(enginePlatformSupport('apple-container', macIntel).supported).toBe(false)
    expect(enginePlatformSupport('apple-container', macOld).supported).toBe(false)
  })
})

describe('enginePreference', () => {
  it('prefers orbstack first on macOS', () => {
    expect(enginePreference(macSilicon)[0]).toBe('orbstack')
    expect(enginePreference(macSilicon)).toContain('apple-container')
  })

  it('excludes mac-only engines on linux', () => {
    const pref = enginePreference(linux)
    expect(pref).not.toContain('orbstack')
    expect(pref).not.toContain('apple-container')
    expect(pref[0]).toBe('docker')
  })
})
