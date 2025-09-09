import { selectWithTopDescription } from '@/ui/components/selectWithTopDescription'
import { execSync } from 'node:child_process'

function isCursorAvailable(): boolean {
    try {
        execSync('which cursor', { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

export async function openIn() {
    const choices = [
        { name: 'Terminal', value: 'shell' },
        { name: 'VS Code', value: 'code' },
    ]

    if (isCursorAvailable()) {
        choices.push({ name: 'Cursor', value: 'cursor' })
    }

    return await selectWithTopDescription({
        message: 'Select an interface to attach to the devcontainer:',
        choices,
    })
}