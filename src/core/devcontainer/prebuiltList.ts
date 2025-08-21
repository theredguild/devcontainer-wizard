import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { devcontainerUp } from '@/core/devcontainer/devcontainerUp'
import { openIn } from '@/utils/openIn'
import { copyPrebuiltContainer } from '@/core/devcontainer/resolvePrebuiltPath'

export async function prebuiltList() {
    const selected = await selectWithTopDescription({
        message: 'Select a pre-built container to start:',
        choices: [
            {
              name: 'Minimal 🧶',
              value: 'minimal',
              description: 'Contains a beginner friendly environment.',
              disabled: false
            },
            {
              name: 'Auditor 🔍',
              value: 'auditor',
              description: 'Contains an audit-ready environment.',
              disabled: false,
            },
            {
              name: 'Legacy The Red Guild 🪷',
              value: 'legacy-theredguild',
              description: 'The Red Guild\'s original devcontainer. (Legacy)',
              disabled: false
            },
            {
              name: 'Legacy Minimal 🧶',
              value: 'legacy-minimal',
              description: 'The Red Guild\'s original minimal devcontainer. (Legacy)',
              disabled: false
            }
        ]
    });

    console.log('📋 Copying selected devcontainer to current directory...');
    const openInSelection = await openIn()

    try {
      const localConfigPath = await copyPrebuiltContainer(selected)
      console.log('🚀 Starting selected devcontainer...');
      await devcontainerUp(localConfigPath, openInSelection);
      console.log('✨ Devcontainer started successfully!');
    } catch (error) {
      console.error('❌ Failed to start devcontainer:', error instanceof Error ? error.message : String(error));
      throw error;
    }
}