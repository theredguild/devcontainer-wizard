import { select, Separator } from '@inquirer/prompts'
import { devcontainerUp } from '@/core/devcontainer/devcontainerUp'
import { openIn } from '@/utils/openIn'

export async function prebuiltList() {
    const selected = await select({
    message: 'Select a pre-built container to start:',
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