import { Separator } from '@inquirer/core'
import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { copyPrebuiltContainer } from '@/core/devcontainer/resolvePrebuiltPath'
import { colorize, symbols } from '@/ui/components'
import { shouldRun } from '@/utils/shouldRun'

type PrebuiltChoice = { name: string; value: string; description: string; disabled: boolean, experimental?: boolean };

const PREBUILT_CHOICES: PrebuiltChoice[] = [
  {
    name: 'Minimal 🧶',
    value: 'minimal',
    description: 'Use Hardhat and Foundry doing zero config.',
    disabled: false
  },
  {
    name: 'Auditor 🔍',
    value: 'auditor',
    description: 'Audit smart contracts.',
    disabled: false,
  },
  {
    name: 'Isolated 🔒',
    value: 'isolated',
    description: 'Run untrusted code.',
    disabled: false,
  },
  {
    name: 'Air-gapped ✈️',
    value: 'airgapped',
    description: 'Air-gapped environment.',
    disabled: false,
  },
  {
    name: 'ETH Security Toolbox 📦️',
    value: 'eth-security-toolbox',
    description: 'Auditor environment with Trail of Bits selected tools',
    disabled: false
  },
  {
    name: 'Legacy 🪷',
    value: 'legacy',
    description: 'The Red Guild\'s original devcontainer.',
    disabled: false
  },
  {
    name: 'Paranoid 🔒',
    value: 'paranoid',
    description: 'Maximum security isolation, read-only OS and air-gapped environments.',
    disabled: false,
    experimental: true,
  },
];

export async function prebuiltList(options?: { listOnly?: boolean; selected?: string }): Promise<any> {
  const listOnly = options?.listOnly === true;
  const selectedName = options?.selected;

  if (listOnly) { 
    const maxValueLength = Math.max(...PREBUILT_CHOICES.map(choice => choice.value.length));
    const paddingLength = maxValueLength + 2;
    
    for (const choice of PREBUILT_CHOICES) {
      const paddedValue = choice.value.padEnd(paddingLength);
      console.log(`${paddedValue}${choice.description}`);
    }
    return;
  }

  const choices = [];
  const regularChoices = PREBUILT_CHOICES.filter(choice => !choice.experimental);
  const experimentalChoices = PREBUILT_CHOICES.filter(choice => choice.experimental);
  
  choices.push(...regularChoices);
  if (experimentalChoices.length > 0) {
    choices.push(new Separator("——— Experimental Profiles ———"));
    choices.push(...experimentalChoices);
  }

  let selected: any;
  if (selectedName) {
    const match = PREBUILT_CHOICES.find(c => c.value === selectedName);
    if (!match) {
      console.error(colorize.error(symbols.circle + ` Unknown prebuilt name: "${selectedName}"`));
      console.log('');
      return Symbol.for('back');
    }
    selected = match.value;
  } else {
    selected = await selectWithTopDescription({
      message: 'Select a pre-built container to start:',
      choices: choices,
      footer: { back: true, exit: true },
      allowBack: true,
    });
    if (selected === Symbol.for('back')) {
      return Symbol.for('back');
    }
  }

  console.log(colorize.brand(symbols.bullet + ' Copying selected devcontainer to current directory...'));
  console.log(colorize.brand(symbols.check + ' Selected devcontainer copied successfully!'));
  try {
    const localConfigPath = await copyPrebuiltContainer(selected)
    const runResult = await shouldRun(localConfigPath);
    if (runResult === Symbol.for('back')) {
      return Symbol.for('back');
    }
  } catch (error) {
    console.error(colorize.error(symbols.circle + ' Failed to copy devcontainer: ' + (error instanceof Error ? error.message : String(error))));
    console.log('')
  }
}

export function getPrebuiltChoices(): ReadonlyArray<PrebuiltChoice> {
  return PREBUILT_CHOICES;
}