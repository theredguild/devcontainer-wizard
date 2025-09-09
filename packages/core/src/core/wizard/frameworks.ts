import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription"

export async function frameworks(state: {frameworks?: string[]}) {
  return await checkboxWithTopDescription({
    message: "Select frameworks",
    choices: [
      { name: "Foundry", value: "foundry", description: "Automatically installs: Rust", checked: state.frameworks?.includes("foundry") },
      { name: "Hardhat", value: "hardhat", description: "Automatically installs: Node.js, pnpm (package manager)", checked: state.frameworks?.includes("hardhat") },
      { name: "Ape (ApeWorX)", value: "ape", description: "Automatically installs: Python, uv (package manager)", checked: state.frameworks?.includes("ape") },
    ],
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true,
  });
}
