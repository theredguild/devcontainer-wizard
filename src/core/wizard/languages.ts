import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";

export async function languages(state: {languages?: string[]}) {
  return await checkboxWithTopDescription({
    message: 'Select smart contract languages',
    choices: [
        { name: 'Solidity', value: 'solidity', description: 'Automatically installs: solc, solc-select', checked: state.languages?.includes("solidity") },
        { name: 'Vyper', value: 'vyper', description: 'Automatically installs: python, python3-dev, libpython3-dev, uv', checked: state.languages?.includes("vyper") }
    ],
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true,
    });
}