import { checkbox, confirm, Separator } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

type VscodeExtension = { id: string; name: string };

const recommendedExtensions: VscodeExtension[] = [
  { id: "tintinweb.ethereum-security-bundle", name: "Tintin's Ethereum Security Bundle" },
  { id: "tintinweb.vscode-ethover", name: "Tintin's EthOver" },
  { id: "trailofbits.weaudit", name: "WeAudit" },
  { id: "tintinweb.vscode-inline-bookmarks", name: "Tintin's Inline Bookmarks" },
  { id: "tintinweb.vscode-solidity-language", name: "Tintin's Solidity Language Tools" },
  { id: "tintinweb.graphviz-interactive-preview", name: "Tintin's Graphviz Interactive Preview" },
  { id: "NomicFoundation.hardhat-solidity", name: "Nomic's Solidity + Hardhat" },
  { id: "Olympixai.olympix", name: "Olympix" },
  { id: "trailofbits.contract-explorer", name: "Trail of Bits Contract Explorer" },
  { id: "tintinweb.vscode-decompiler", name: "Tintin's Smart Contract Decompiler" },
];

export async function vscodeExtensions(): Promise<string[]> {
  const autoInstall = await confirm({
    message: "Do you want to automatically install recommended VS Code extensions?",
    theme: checkboxStyle,
    default: true,
  });

  if (autoInstall) {
    return recommendedExtensions.map((ext) => ext.id);
  }

  const selected = await checkbox({
    message: "Select VS Code extensions to install",
    theme: checkboxStyle,
    choices: [
      new Separator("Recommended"),
      ...recommendedExtensions.map((ext) => ({ name: ext.name, value: ext.id })),
    ],
  });

  return selected as string[];
}
