import {
    languages,
    frameworks,
    fuzzingAndTesting,
    securityTooling,
    systemHardening,
    securityProfiles,
    recipesToSecurityHardening,
    vscodeExtensions,
    savePath,
    devcontainerName,
    gitClone,
} from '@/core/wizard'
import type { WizardState } from '@/types'
import { selectWithTopDescription } from "@/ui/components/selectWithTopDescription";
import { colorize } from "@/ui/styling/colors";
import { symbols } from "@/ui/styling/symbols";
import { ui } from "@/ui/styling/ui";

const BACK = Symbol.for('back');
export async function wizard(args: { name?: string }) {

  const wizardState: WizardState = {}

  const steps = [
    async () => {
        const result = args.name !== undefined ? args.name : await devcontainerName({ name: wizardState.name });
        if ((result as any) !== BACK) wizardState.name = result as string;
        return result;
    },
    async () => {
        const result = await languages({ languages: wizardState.languages });
        if ((result as any) !== BACK) wizardState.languages = result as string[];
        return result;
    },
    async () => {
        const result = await frameworks({ frameworks: wizardState.frameworks });
        if ((result as any) !== BACK) wizardState.frameworks = result as string[];
        return result;
    },
    async () => {
        const result = await fuzzingAndTesting({ fuzzingAndTesting: wizardState.fuzzingAndTesting });
        if ((result as any) !== BACK) wizardState.fuzzingAndTesting = result as string[];
        return result;
    },
    async () => {
        const result = await securityTooling({ securityTooling: wizardState.securityTooling });
        if ((result as any) !== BACK) wizardState.securityTooling = result as string[];
        return result;
    },
    async () => {
        const hardeningMethod = await selectWithTopDescription({
            message: 'How would you like to configure security hardening?',
            choices: [
                { 
                    name: 'Use security profiles', 
                    value: 'profiles',
                    description: 'Choose from predefined security configurations'
                },
                { 
                    name: 'Manual selection', 
                    value: 'manual',
                    description: 'Manually select individual security hardening options'
                },
            ],
            footer: {
                back: true,
                exit: true,
            },
            allowBack: true,
        })

        if (hardeningMethod === BACK) {
            return BACK;
        }

        if (hardeningMethod === 'profiles') {
            const selectedProfile = await securityProfiles()
            if (selectedProfile === BACK) return BACK;

            wizardState.systemHardening = recipesToSecurityHardening([selectedProfile])
            
            if (wizardState.systemHardening.length > 0) {
                console.log(`
${colorize.brand(`${symbols.diamond} Security hardening options automatically selected from profiles:`)}`)
                wizardState.systemHardening.forEach(option => {
                    console.log(`  ${colorize.success(symbols.check)} ${colorize.brand(option)}`)
                })
                console.log('')
            }
            return selectedProfile;
        } else {
            const result = await systemHardening({ systemHardening: wizardState.systemHardening })
            if ((result as any) !== BACK) wizardState.systemHardening = result as string[];
            return result;
        }
    },
    async () => {
        const result = await vscodeExtensions({ vscodeExtensions: wizardState.vscodeExtensions });
        if ((result as any) !== BACK) wizardState.vscodeExtensions = result as string[];
        return result;
    },
    async () => {
        const result = await gitClone({ gitClone: wizardState.gitRepository?.enabled });
        if ((result as any) !== BACK) wizardState.gitRepository = result as any;
        return result;
    },
    async () => {
        const result = await savePath();
        if (result !== BACK) wizardState.savePath = result as string;
        return result;
    },
  ];

  let currentStep = 0;
  while (currentStep < steps.length) {
    ui.clearScreen();
    console.log(ui.header());
    console.log('');

    const result = await steps[currentStep]();

    if (result === BACK) {
        currentStep--;
    } else {
        currentStep++;
    }
  }

  return wizardState
}