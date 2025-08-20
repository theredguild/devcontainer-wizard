import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";

export async function languages() {
  return await checkboxWithTopDescription({
    message: 'Select smart contract languages',
    choices: [
        { name: 'Solidity', value: 'solidity', description: 'Automatically installs: solc, solc-select' },
        { name: 'Vyper', value: 'vyper', description: 'Automatically installs: python, python3-dev, libpython3-dev, uv' }
    ],
    });
}