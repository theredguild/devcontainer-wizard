import { spawn } from 'node:child_process'
import path from 'node:path'

export interface UpOptions {
  workspaceFolder: string
  configPath?: string
}

export async function Up(selected: string | UpOptions) {
  const args: string[] = ['up']

  if (typeof selected === 'string') {
    const workspaceFolder = path.resolve(selected)
    args.push('--workspace-folder', workspaceFolder)
  } else {
    const workspaceFolder = path.resolve(selected.workspaceFolder)
    args.push('--workspace-folder', workspaceFolder)
    if (selected.configPath) {
      args.push('--config', path.resolve(selected.configPath))
    }
  }

  return await new Promise<void>((resolve, reject) => {
    const child = spawn('devcontainer', args, { stdio: 'inherit' })
    child.on('close', (code) => {
      if (code === 0) return resolve()
      reject(new Error(`devcontainer up exited with code ${code}`))
    })
    child.on('error', reject)
  })
}
