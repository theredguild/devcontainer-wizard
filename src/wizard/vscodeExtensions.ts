import { checkbox, confirm, Separator } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

const recommendedExtensions = [
  // Solidity and Web3
  "JuanBlanco.solidity",
  "NomicFoundation.hardhat-solidity",
  "tintinweb.solidity-visual-auditor",
  // Python
  "ms-python.python",
  // JavaScript/TypeScript
  "dbaeumer.vscode-eslint",
  "esbenp.prettier-vscode",
  // Git and utilities
  "eamodio.gitlens",
  "editorconfig.editorconfig",
  // Dev containers and Docker
  "ms-vscode-remote.remote-containers",
  "ms-azuretools.vscode-docker",
];

const additionalExtensions = [
  // Testing, UX, extras
  "streetsidesoftware.code-spell-checker",
  "gruntfuggly.todo-tree",
  "ms-vsliveshare.vsliveshare",
  "tamasfe.even-better-toml",
  "bierner.markdown-preview-github-styles",
];

export async function vscodeExtensions(): Promise<string[]> {
  const autoInstall = await confirm({
    message: "Do you want to automatically install recommended VS Code extensions?",
    default: true,
  });

  if (autoInstall) {
    return recommendedExtensions;
  }

  const selected = await checkbox({
    message: "Select VS Code extensions to install",
    theme: checkboxStyle,
    choices: [
      new Separator("Recommended"),
      ...recommendedExtensions.map((ext) => ({ name: ext, value: ext })),
      new Separator("Additional"),
      ...additionalExtensions.map((ext) => ({ name: ext, value: ext })),
    ],
  });

  return selected as string[];
}
