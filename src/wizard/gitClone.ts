import { input, confirm } from '@inquirer/prompts'
import { inputStyle } from '@/styling/inputStyle'

export interface GitRepositoryConfig {
  url: string
  branch?: string
  enabled: boolean
}

export async function gitClone(): Promise<GitRepositoryConfig> {
  const shouldClone = await confirm({
    message: 'Would you like to automatically clone a git repository during build?',
    default: false
  })

  if (!shouldClone) {
    return {
      url: '',
      enabled: false
    }
  }

  const repoUrl = await input({
    message: 'Enter the git repository URL to clone:',
    theme: inputStyle,
    validate: (input: string) => {
      if (!input.trim()) {
        return 'Repository URL cannot be empty'
      }
      
      // Basic URL validation for git repositories
      const gitUrlPattern = /^(https:\/\/|git@|ssh:\/\/|git:\/\/)/
      if (!gitUrlPattern.test(input.trim())) {
        return 'Please enter a valid git repository URL (https://, git@, ssh://, or git://)'
      }
      
      return true
    }
  })

  const shouldSpecifyBranch = await confirm({
    message: 'Would you like to specify a specific branch/tag to clone?',
    default: false
  })

  let branch: string | undefined

  if (shouldSpecifyBranch) {
    branch = await input({
      message: 'Enter the branch or tag name:',
      theme: inputStyle,
      default: 'main',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Branch/tag name cannot be empty'
        }
        return true
      }
    })
  }

  return {
    url: repoUrl.trim(),
    branch: branch?.trim(),
    enabled: true
  }
}
