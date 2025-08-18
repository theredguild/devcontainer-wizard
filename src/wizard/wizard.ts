import {
    languages,
    frameworks,
    fuzzingAndTesting,
    securityTooling,
    systemHardening,
    recipes,
    recipesToSecurityHardening,
    vscodeExtensions,
    savePath,
    devcontainerName,
    gitClone,
} from '@/wizard'
import { WizardState } from '@/types'
import { select } from '@inquirer/prompts'
import { selectStyle } from '@/styling/selectStyle'

export async function wizard(args: { name?: string }) {
  const selectedLanguages = await languages()
  const selectedFrameworks = await frameworks()
  const selectedFuzzingTesting = await fuzzingAndTesting()
  const selectedSecurityTooling = await securityTooling()
 

  const hardeningMethod = await select({
    message: 'How would you like to configure security hardening?',
    theme: selectStyle,
    choices: [
      { 
        name: 'Use security hardening recipes', 
        value: 'recipes',
        description: 'Choose from predefined security configurations'
      },
      { 
        name: 'Manual selection', 
        value: 'manual',
        description: 'Manually select individual security hardening options'
      },
    ],
  })

  let selectedSystemHardening: string[]
  
  if (hardeningMethod === 'recipes') {
    // Use recipes to automatically select security hardening options
    const selectedRecipes = await recipes()
    selectedSystemHardening = recipesToSecurityHardening([selectedRecipes])
    
    // Display what security hardening options were selected from the recipes
    if (selectedSystemHardening.length > 0) {
      console.log('\n🛡️  Security hardening options automatically selected from recipes:')
      selectedSystemHardening.forEach(option => {
        console.log(`  ✓ ${option}`)
      })
      console.log('')
    }
  } else {
    // Use manual selection
    selectedSystemHardening = await systemHardening()
  }

  const selectedVscodeExtensions = await vscodeExtensions()
  const selectedGitRepository = await gitClone()
  const selectedSavePath = await savePath()
  const selectedDevcontainerName = args.name !== undefined ? args.name : await devcontainerName()

  const wizardState: WizardState = {
    name: selectedDevcontainerName,
    languages: selectedLanguages,
    frameworks: selectedFrameworks,
    fuzzingAndTesting: selectedFuzzingTesting,
    securityTooling: selectedSecurityTooling,
    systemHardening: selectedSystemHardening,
    vscodeExtensions: selectedVscodeExtensions,
    gitRepository: selectedGitRepository,
    savePath: selectedSavePath,
  }

  return wizardState
}