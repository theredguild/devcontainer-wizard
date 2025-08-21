import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'

export async function openIn() {
    return await selectWithTopDescription({
        message: 'Select an interface to attach to the devcontainer:',
        choices: [
            { name: 'Terminal', value: 'shell' },
            { name: 'VS Code', value: 'code' },
        ],
    })
}