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
} from '@/core/wizard'
import { WizardState } from '@/types'
import { selectWithTopDescription } from "@/ui/components/selectWithTopDescription";
import { colorize } from "@/ui/styling/colors";
import { symbols } from "@/ui/styling/symbols";
import { ui } from "@/ui/styling/ui";

export async function wizard(args: { name?: string }) {
  const totalSteps = 9;
  let currentStep = 1;
  
  // Step 1: Devcontainer Name
  ui.clearScreen();
  console.log(ui.header('Devcontainer Name', currentStep, totalSteps));
  console.log('');
  const selectedDevcontainerName = args.name !== undefined ? args.name : await devcontainerName()
  currentStep++;
  
  // Step 2: Languages
  ui.clearScreen();
  console.log(ui.header('Select Languages', currentStep, totalSteps));
  console.log('');
  const selectedLanguages = await languages()
  currentStep++;
  
  // Step 3: Frameworks
  ui.clearScreen();
  console.log(ui.header('Select Frameworks', currentStep, totalSteps));
  console.log('');
  const selectedFrameworks = await frameworks()
  currentStep++;
  
  // Step 4: Fuzzing & Testing
  ui.clearScreen();
  console.log(ui.header('Select Fuzzing & Testing Tools', currentStep, totalSteps));
  console.log('');
  const selectedFuzzingTesting = await fuzzingAndTesting()
  currentStep++;
  
  // Step 5: Security Tooling
  ui.clearScreen();
  console.log(ui.header('Select Security Tools', currentStep, totalSteps));
  console.log('');
  const selectedSecurityTooling = await securityTooling()
  currentStep++;

  // Step 6: Security Hardening Method
  ui.clearScreen();
  console.log(ui.header('Security Hardening Method', currentStep, totalSteps));
  console.log('');
  const hardeningMethod = await selectWithTopDescription({
    message: 'How would you like to configure security hardening?',
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
  currentStep++;

  let selectedSystemHardening: string[]
  
  if (hardeningMethod === 'recipes') {
    // Step 7a: Security Recipes
    ui.clearScreen();
    console.log(ui.header('Select Security Recipes', currentStep, totalSteps));
    console.log('');
    const selectedRecipes = await recipes()
    selectedSystemHardening = recipesToSecurityHardening([selectedRecipes])
    
    // Display what security hardening options were selected from the recipes
    if (selectedSystemHardening.length > 0) {
      console.log(`\n${colorize.brand(`${symbols.diamond} Security hardening options automatically selected from recipes:`)}`)
      selectedSystemHardening.forEach(option => {
        console.log(`  ${colorize.success(symbols.check)} ${colorize.brand(option)}`)
      })
      console.log('')
    }
    currentStep++;
  } else {
    // Step 7b: Manual Security Hardening
    ui.clearScreen();
    console.log(ui.header('Select Security Hardening Options', currentStep, totalSteps));
    console.log('');
    selectedSystemHardening = await systemHardening()
    currentStep++;
  }

  // Step 8: VS Code Extensions
  ui.clearScreen();
  console.log(ui.header('Select VS Code Extensions', currentStep, totalSteps));
  console.log('');
  const selectedVscodeExtensions = await vscodeExtensions()
  currentStep++;
  
  // Step 9: Git Repository
  ui.clearScreen();
  console.log(ui.header('Git Repository Configuration', currentStep, totalSteps));
  console.log('');
  const selectedGitRepository = await gitClone()
  currentStep++;
  
  // Step 10: Save Path
  ui.clearScreen();
  console.log(ui.header('Select Save Path', currentStep, totalSteps));
  console.log('');
  const selectedSavePath = await savePath()

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