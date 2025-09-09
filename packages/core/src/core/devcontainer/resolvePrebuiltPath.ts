import * as path from 'path'
import * as fs from 'fs/promises'
import { execSync } from 'child_process'

const PREBUILT_REPO = 'https://github.com/theredguild/devcontainer.git'
const PREBUILT_CACHE_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.devcontainer-wizard', 'prebuilt-cache')

// Ensure the cache directory exists
async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(PREBUILT_CACHE_DIR, { recursive: true })
}

// Clone or update the prebuilt containers repository
async function ensurePrebuiltRepo(): Promise<string> {
  await ensureCacheDir()
  
  const repoPath = path.join(PREBUILT_CACHE_DIR, 'devcontainer')
  
  try {
    // Check if directory exists and is a git repository
    const stats = await fs.stat(repoPath)
    if (stats.isDirectory()) {
      // Try to update existing repository
      try {
        execSync('git pull', { cwd: repoPath, stdio: 'pipe' })
      } catch (error) {
        // If update fails, remove and re-clone
        await fs.rm(repoPath, { recursive: true, force: true })
        execSync(`git clone ${PREBUILT_REPO} "${repoPath}"`, { stdio: 'pipe' })
      }
    } else {
      // Directory exists but is not a directory, remove and clone
      await fs.rm(repoPath, { recursive: true, force: true })
      execSync(`git clone ${PREBUILT_REPO} "${repoPath}"`, { stdio: 'pipe' })
    }
  } catch (error) {
    // Directory doesn't exist, clone it
    execSync(`git clone ${PREBUILT_REPO} "${repoPath}"`, { stdio: 'pipe' })
  }
  
  return repoPath
}

// Copy a prebuilt devcontainer folder to the current working directory
export async function copyPrebuiltContainer(containerName: string): Promise<string> {
  const repoPath = await ensurePrebuiltRepo()
  const sourceFolder = path.join(repoPath, '.devcontainer', containerName)
  const targetFolder = path.join(process.cwd(), '.devcontainer', containerName)

  // Create target directory
  await fs.mkdir(targetFolder, { recursive: true })

  // Copy all files from source to target
  const entries = await fs.readdir(sourceFolder, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(sourceFolder, entry.name)
    const destPath = path.join(targetFolder, entry.name)

    if (entry.isDirectory()) {
      await fs.cp(srcPath, destPath, { recursive: true })
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }

  return path.join(targetFolder, 'devcontainer.json')
}


