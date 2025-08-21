import * as path from 'path'
import * as fs from 'fs/promises'

// Resolve an absolute path to a prebuilt devcontainer config inside this package
// Works when the CLI is installed globally or run locally
export function resolvePrebuiltPath(relativeConfigPath: string): string {
	// __dirname is dist path at runtime; navigate to package root then to .devcontainer
	// The relative paths provided include the leading .devcontainer/...
	const packageRoot = path.resolve(__dirname, '../../..')
	return path.join(packageRoot, relativeConfigPath)
}

// Copy a prebuilt devcontainer folder to the current working directory
export async function copyPrebuiltContainer(relativeConfigPath: string): Promise<string> {
	const packageRoot = path.resolve(__dirname, '../../..')
	const sourceFolder = path.dirname(path.join(packageRoot, relativeConfigPath))
	const folderName = path.basename(sourceFolder)
	const targetFolder = path.join(process.cwd(), '.devcontainer', folderName)

	// Create target directory
	await fs.mkdir(targetFolder, { recursive: true })

	// Copy all files from source to target
	const entries = await fs.readdir(sourceFolder, { withFileTypes: true })

	for (const entry of entries) {
		const srcPath = path.join(sourceFolder, entry.name)
		const destPath = path.join(targetFolder, entry.name)

		if (entry.isDirectory()) {
			await fs.cp(srcPath, destPath, { recursive: true })
		} else {
			await fs.copyFile(srcPath, destPath)
		}
	}

	return path.join(targetFolder, 'devcontainer.json')
}


