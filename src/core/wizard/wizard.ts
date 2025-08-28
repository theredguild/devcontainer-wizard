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

  const wizardState: WizardState = {}
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.name = args.name !== undefined ? args.name : await devcontainerName()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.languages = await languages()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.frameworks = await frameworks()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.fuzzingAndTesting = await fuzzingAndTesting()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.securityTooling = await securityTooling()
  currentStep++;

  ui.clearScreen();
  console.log(ui.header());
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

  if (hardeningMethod === 'recipes') {
    ui.clearScreen();
    console.log(ui.header());
    console.log('');
    const selectedRecipes = await recipes()
    wizardState.systemHardening = recipesToSecurityHardening([selectedRecipes])
    
    if (wizardState.systemHardening.length > 0) {
      console.log(`\n${colorize.brand(`${symbols.diamond} Security hardening options automatically selected from recipes:`)}`)
      wizardState.systemHardening.forEach(option => {
        console.log(`  ${colorize.success(symbols.check)} ${colorize.brand(option)}`)
      })
      console.log('')
    }
    currentStep++;
  } else {
    ui.clearScreen();
    console.log(ui.header());
    console.log('');
    wizardState.systemHardening = await systemHardening()
    currentStep++;
  }

  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.vscodeExtensions = await vscodeExtensions()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.gitRepository = await gitClone()
  currentStep++;
  
  ui.clearScreen();
  console.log(ui.header());
  console.log('');
  wizardState.savePath = await savePath()

  return wizardState
}