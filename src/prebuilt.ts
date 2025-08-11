import path from 'node:path'
import fs from 'node:fs'
import { select, Separator } from '@inquirer/prompts'
import { Up } from '@/up'
import { spawn } from 'node:child_process'

function resolveDevcontainerConfig(templateName: string) {
  const relative = path.join('.devcontainer', templateName, 'devcontainer.json')
  const inWorkspace = path.join(process.cwd(), relative)
  if (fs.existsSync(inWorkspace)) {
    return {
      workspaceFolder: process.cwd(),
      configPath: inWorkspace,
    }
  }

  const packageRoot = path.resolve(path.dirname(process.argv[1] ?? ''), '..')
  const packaged = path.join(packageRoot, relative)
  return {
    workspaceFolder: process.cwd(),
    configPath: packaged,
  }
}

export async function prebuilt() {
    const selected = await select({
    message: 'Select a pre-built container',
    choices: [
        {
          name: 'Minimal',
          value: resolveDevcontainerConfig('minimal'),
          description: 'Minimal configuration contains a beginner friendly enviroment',
          disabled: false
        },
        {
          name: 'The Red Guild 🪷',
          value: resolveDevcontainerConfig('theredguild'),
          description: 'The Red Guild devcontainer',
          disabled: false
        },
        new Separator(),
        {
          name: 'Hardened',
          value: resolveDevcontainerConfig('hardened'),
          description: '',
          disabled: '(this configuration is not implemented)',
        },
        {
          name: 'Paranoid',
          value: resolveDevcontainerConfig('paranoid'),
          description: '',
          disabled: '(this configuration is not implemented)',
        }
    ]});

    const openInVscode = await select({
      message: 'Open VS Code in the container after starting?',
      choices: [
        { name: 'Yes', value: true },
        { name: 'No', value: false },
      ],
    })

    if (openInVscode) {
      await Up(selected)
      // Launch VS Code on the workspace; VS Code will prompt to reopen in container if Dev Containers extension is installed
      const workspaceFolder = typeof selected === 'string' ? selected : selected.workspaceFolder
      spawn('code', [workspaceFolder], { stdio: 'inherit' })
    } else {
      await Up(selected)
    }
}