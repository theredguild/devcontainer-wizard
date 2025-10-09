import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as semver from 'semver'

interface UpdateCheckCache {
  checkedAt: number
  latestVersion: string
  hasUpdate: boolean
}

interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  updateCommand: string
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const GITHUB_API_URL = 'https://api.github.com/repos/theredguild/devcontainer-wizard/tags'
const GITHUB_API_TIMEOUT = 3000 // 3 seconds timeout

/**
 * Get the cache directory path based on the operating system
 */
function getCacheDir(): string {
  const platform = os.platform()
  let cacheDir: string

  if (platform === 'win32') {
    cacheDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'devcontainer-wizard')
  } else if (platform === 'darwin') {
    cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'devcontainer-wizard')
  } else {
    // Linux and other Unix-like systems
    cacheDir = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'devcontainer-wizard')
  }

  return cacheDir
}

/**
 * Get the cache file path
 */
function getCacheFilePath(): string {
  return path.join(getCacheDir(), 'update-check.json')
}

/**
 * Read cache from disk
 */
function readCache(): UpdateCheckCache | null {
  try {
    const cacheFilePath = getCacheFilePath()
    if (!fs.existsSync(cacheFilePath)) {
      return null
    }

    const cacheData = fs.readFileSync(cacheFilePath, 'utf-8')
    const cache: UpdateCheckCache = JSON.parse(cacheData)

    // Check if cache is still valid
    const now = Date.now()
    if (now - cache.checkedAt < CACHE_TTL_MS) {
      return cache
    }

    return null
  } catch {
    // Fail silently if cache read fails
    return null
  }
}

/**
 * Write cache to disk
 */
function writeCache(cache: UpdateCheckCache): void {
  try {
    const cacheDir = getCacheDir()
    const cacheFilePath = getCacheFilePath()

    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }

    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch {
    // Fail silently if cache write fails
  }
}

/**
 * Fetch latest tag from GitHub API
 */
async function fetchLatestTag(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT)

    const response = await fetch(GITHUB_API_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'devcontainer-wizard'
      }
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return null
    }

    const tags = await response.json() as Array<{ name: string }>
    
    if (!tags || tags.length === 0) {
      return null
    }

    // Get the first tag (latest)
    const latestTag = tags[0].name
    
    // Remove 'v' prefix if present
    return latestTag.startsWith('v') ? latestTag.slice(1) : latestTag
  } catch {
    // Fail silently on network errors, timeouts, etc.
    return null
  }
}

/**
 * Get current package version from package.json
 */
function getCurrentVersion(): string {
  try {
    // Read package.json from the package root
    // Use require.resolve to find the package.json
    const packageJsonPath = require.resolve('../../package.json')
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return packageJson.version
  } catch {
    // Fallback to a default version if reading fails
    return '0.0.0'
  }
}

/**
 * Detect which package manager was used to install the CLI
 */
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  // Check npm_config_user_agent environment variable
  const userAgent = process.env.npm_config_user_agent || ''
  
  if (userAgent.includes('pnpm')) {
    return 'pnpm'
  }
  
  if (userAgent.includes('yarn')) {
    return 'yarn'
  }
  
  // Default to npm
  return 'npm'
}

/**
 * Get the appropriate update command based on package manager
 */
function getUpdateCommand(): string {
  const packageManager = detectPackageManager()
  
  switch (packageManager) {
    case 'pnpm':
      return 'pnpm add -g devcontainer-wizard@latest'
    case 'yarn':
      return 'yarn global add devcontainer-wizard@latest'
    case 'npm':
    default:
      return 'npm install -g devcontainer-wizard@latest'
  }
}

/**
 * Check if update check is disabled via environment variable
 */
function isUpdateCheckDisabled(): boolean {
  const envVar = process.env.DEVCONTAINER_WIZARD_DISABLE_UPDATE_CHECK
  return envVar === '1' || envVar === 'true' || envVar === 'yes'
}

/**
 * Check for updates and return result
 * This function is non-blocking and fails silently on errors
 */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  // Check if update check is disabled
  if (isUpdateCheckDisabled()) {
    return null
  }

  const currentVersion = getCurrentVersion()

  // Try to read from cache first
  const cachedResult = readCache()
  if (cachedResult) {
    // Re-check hasUpdate against current version in case it changed
    let hasUpdate = false
    try {
      const current = semver.clean(currentVersion)
      const latest = semver.clean(cachedResult.latestVersion)
      
      if (current && latest) {
        hasUpdate = semver.gt(latest, current)
      }
    } catch {
      hasUpdate = false
    }
    
    return {
      hasUpdate,
      currentVersion,
      latestVersion: cachedResult.latestVersion,
      updateCommand: getUpdateCommand()
    }
  }

  // Fetch latest version from GitHub
  const latestVersion = await fetchLatestTag()
  
  if (!latestVersion) {
    // If fetch fails, return null (fail silently)
    return null
  }

  // Compare versions using semver
  let hasUpdate = false
  try {
    const current = semver.clean(currentVersion)
    const latest = semver.clean(latestVersion)
    
    if (current && latest) {
      hasUpdate = semver.gt(latest, current)
    }
  } catch {
    // If semver comparison fails, assume no update
    hasUpdate = false
  }

  // Write to cache
  const cache: UpdateCheckCache = {
    checkedAt: Date.now(),
    latestVersion,
    hasUpdate
  }
  writeCache(cache)

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    updateCommand: getUpdateCommand()
  }
}

