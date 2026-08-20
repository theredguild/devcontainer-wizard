import { capture } from './exec.js'
import type { EngineName } from './types.js'

export type HostOS = 'macos' | 'linux' | 'windows' | 'other'
export type HostArch = 'arm64' | 'x64' | 'other'

export interface HostInfo {
  os: HostOS
  arch: HostArch
  /** Major macOS product version (e.g. 15), when on macOS. */
  macosMajor?: number
}

function mapOS(platform: NodeJS.Platform): HostOS {
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  if (platform === 'win32') return 'windows'
  return 'other'
}

function mapArch(arch: string): HostArch {
  if (arch === 'arm64') return 'arm64'
  if (arch === 'x64') return 'x64'
  return 'other'
}

/** Detect host OS/arch and (on macOS) the major product version. */
export async function detectHost(): Promise<HostInfo> {
  const hostOS = mapOS(process.platform)
  const arch = mapArch(process.arch)
  const info: HostInfo = { os: hostOS, arch }

  if (hostOS === 'macos') {
    const res = await capture('sw_vers', ['-productVersion'])
    if (!res.spawnError && res.code === 0) {
      const major = Number.parseInt(res.stdout.trim().split('.')[0] ?? '', 10)
      if (Number.isFinite(major)) info.macosMajor = major
    }
  }

  return info
}

export interface PlatformSupport {
  supported: boolean
  /** Reason the engine cannot run on this host (only set when unsupported). */
  reason?: string
}

/**
 * Whether an engine can run on a given host at all (independent of whether it
 * is installed). Apple Containers is the strictest: macOS 15+ on Apple Silicon.
 */
export function enginePlatformSupport(engine: EngineName, host: HostInfo): PlatformSupport {
  switch (engine) {
    case 'docker':
    case 'podman':
      return { supported: true }
    case 'orbstack':
      return host.os === 'macos'
        ? { supported: true }
        : { supported: false, reason: 'OrbStack runs on macOS only.' }
    case 'lima':
      return host.os === 'macos' || host.os === 'linux'
        ? { supported: true }
        : { supported: false, reason: 'Lima runs on macOS and Linux only.' }
    case 'apple-container': {
      if (host.os !== 'macos') {
        return { supported: false, reason: 'Apple Containers requires macOS.' }
      }
      if (host.arch !== 'arm64') {
        return { supported: false, reason: 'Apple Containers requires Apple Silicon (arm64).' }
      }
      if (host.macosMajor !== undefined && host.macosMajor < 15) {
        return { supported: false, reason: 'Apple Containers requires macOS 15 (Sequoia) or newer.' }
      }
      return { supported: true }
    }
    default:
      return { supported: false, reason: 'Unknown engine.' }
  }
}

/** Auto-select preference order, host-dependent (best first). */
export function enginePreference(host: HostInfo): EngineName[] {
  if (host.os === 'macos') {
    return ['orbstack', 'docker', 'podman', 'apple-container', 'lima']
  }
  if (host.os === 'linux') {
    return ['docker', 'podman', 'lima']
  }
  return ['docker', 'podman']
}

export function describeHost(host: HostInfo): string {
  const osLabel =
    host.os === 'macos'
      ? `macOS${host.macosMajor ? ` ${host.macosMajor}` : ''}`
      : host.os === 'linux'
        ? 'Linux'
        : host.os === 'windows'
          ? 'Windows'
          : 'unknown OS'
  return `${osLabel} (${host.arch})`
}
