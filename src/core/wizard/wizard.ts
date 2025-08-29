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

  let currentStep = 1;
  const wizardState: WizardState = {}

  while (currentStep <= 8) {
    ui.clearScreen();
    console.log(ui.header());
    console.log('');

    switch (currentStep) {
      case 1:
        wizardState.name = args.name !== undefined ? args.name : await devcontainerName()
        break;
      
      case 2:
        wizardState.languages = await languages()
        break;
      
      case 3:
        wizardState.frameworks = await frameworks()
        break;
      
      case 4:
        wizardState.fuzzingAndTesting = await fuzzingAndTesting()
        break;
      
      case 5:
        wizardState.securityTooling = await securityTooling()
        break;
      
      case 6:
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

        if (hardeningMethod === 'recipes') {
          const selectedRecipes = await recipes()
          wizardState.systemHardening = recipesToSecurityHardening([selectedRecipes])
          
          if (wizardState.systemHardening.length > 0) {
            console.log(`\n${colorize.brand(`${symbols.diamond} Security hardening options automatically selected from recipes:`)}`)
            wizardState.systemHardening.forEach(option => {
              console.log(`  ${colorize.success(symbols.check)} ${colorize.brand(option)}`)
            })
            console.log('')
          }
        } else {
          wizardState.systemHardening = await systemHardening()
        }
        break;
      
      case 7:
        wizardState.vscodeExtensions = await vscodeExtensions()
        break;
      
      case 8:
        wizardState.gitRepository = await gitClone()
        break;
      
      case 9:
        wizardState.savePath = await savePath()
        break;
    }
    
    currentStep++;
  }

  return wizardState
}