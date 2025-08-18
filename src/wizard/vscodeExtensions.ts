import { checkbox, confirm, Separator } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

type VscodeExtension = { id: string; name: string };

const tintinExtensions: VscodeExtension[] = [
  { id: "tintinweb.ethereum-security-bundle", name: "Tintin's Ethereum Security Bundle" },
  { id: "tintinweb.vscode-ethover", name: "Tintin's EthOver" },
  { id: "trailofbits.weaudit", name: "WeAudit" },
  { id: "tintinweb.vscode-inline-bookmarks", name: "Tintin's Inline Bookmarks" },
  { id: "tintinweb.vscode-solidity-language", name: "Tintin's Solidity Language Tools" },
  { id: "tintinweb.graphviz-interactive-preview", name: "Tintin's Graphviz Interactive Preview" },
  { id: "trailofbits.contract-explorer", name: "Trail of Bits Contract Explorer" },
  { id: "tintinweb.vscode-decompiler", name: "Tintin's Smart Contract Decompiler" },
];

const NomicFoundation: VscodeExtension[] = [
  { id: "NomicFoundation.hardhat-solidity", name: "Nomic's Solidity + Hardhat" },
]

const Olympix: VscodeExtension[] = [
  { id: "Olympixai.olympix", name: "Olympix" },
]

export async function vscodeExtensions(): Promise<string[]> {
  const autoInstall = await confirm({
    message: "Do you want to automatically install recommended VS Code extensions?",
    theme: checkboxStyle,
    default: true,
  });

  if (autoInstall) {
    return tintinExtensions.map((ext) => ext.id);
  }

  const selected = await checkbox({
    message: "Select VS Code extensions to install",
    theme: checkboxStyle,
    loop: false,
    choices: [
      new Separator("Tintin's Extensions"),
      ...tintinExtensions.map((ext) => ({ name: ext.name, value: ext.id })),
      new Separator("Nomic Foundation"),
      ...NomicFoundation.map((ext) => ({ name: ext.name, value: ext.id })),
      new Separator("Olympix"),
      ...Olympix.map((ext) => ({ name: ext.name, value: ext.id })),
    ],
  });

  return selected as string[];
}
