import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";

export async function coreLanguages(state: {coreLanguages?: string[]}) {
  return await checkboxWithTopDescription({
    message: 'Select core programming languages',
    choices: [
        { name: 'Rust', value: 'rust', description: 'Rust compiler and cargo package manager', checked: state.coreLanguages?.includes("rust") },
        { name: 'Python', value: 'python', description: 'Python runtime with pip and uv package managers', checked: state.coreLanguages?.includes("python") },
        { name: 'Go', value: 'go', description: 'Go programming language with asdf version manager', checked: state.coreLanguages?.includes("go") },
        { name: 'Node.js', value: 'node', description: 'Node.js runtime with pnpm package manager', checked: state.coreLanguages?.includes("node") }
    ],
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true,
  });
}
