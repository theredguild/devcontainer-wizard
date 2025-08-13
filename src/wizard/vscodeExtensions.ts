import { checkbox, confirm, Separator } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

const recommendedExtensions = [
        "tintinweb.ethereum-security-bundle",
        "tintinweb.vscode-ethover",
        "trailofbits.weaudit",
        "tintinweb.vscode-inline-bookmarks", 
        "tintinweb.vscode-solidity-language",
        "tintinweb.graphviz-interactive-preview",
        "NomicFoundation.hardhat-solidity",
        "Olympixai.olympix",
        "trailofbits.contract-explorer",
        "tintinweb.vscode-decompiler" // dependency for panoramix
];

const additionalExtensions = [
  "// Testing, UX, extras"
];

export async function vscodeExtensions(): Promise<string[]> {
  const autoInstall = await confirm({
    message: "Do you want to automatically install recommended VS Code extensions?",
    theme: checkboxStyle,
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
