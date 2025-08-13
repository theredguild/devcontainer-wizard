import { select, Separator } from '@inquirer/prompts'
import { selectStyle } from '@/styling/selectStyle'
import { devcontainerUp } from '@/shared/devcontainerUp'
import { openIn } from '@/shared/openIn'

export async function selectList() {
    const selected = await select({
    message: 'Select a pre-built container to start:',
    theme: selectStyle,
    choices: [
        {
          name: 'Minimal 🧶',
          value: ".devcontainer/minimal/devcontainer.json",
          description: 'Contains a beginner friendly enviroment.',
          disabled: false
        },
        {
          name: 'Auditor 🔍',
          value: ".devcontainer/auditor/devcontainer.json",
          description: 'Contains an audit-ready environment.',
          disabled: false,
        },
        {
          name: 'The Red Guild 🪷',
          value: ".devcontainer/theredguild/devcontainer.json",
          description: 'The Red Guild\'s original devcontainer.',
          disabled: false
        },
        new Separator(),
        {
          name: 'Hardened 🛡️',
          value: ".devcontainer/hardened/devcontainer.json",
          description: '',
          disabled: '(this configuration is not released yet)',
        },
        {
          name: 'Paranoid ☣️',
          value: ".devcontainer/paranoid/devcontainer.json",
          description: '',
          disabled: '(this configuration is not released yet)',
        }
    ]});

    console.log('🚀 Starting selected devcontainer...');
    const openInSelection = await openIn()

    try {
      await devcontainerUp(selected, openInSelection);
      console.log('✨ Devcontainer started successfully!');
    } catch (error) {
      console.error('❌ Failed to start devcontainer:', error instanceof Error ? error.message : String(error));
      throw error;
    }
}