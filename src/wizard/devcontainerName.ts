import { input } from "@inquirer/prompts";
import { inputStyle } from "@/styling/inputStyle";
import * as path from "node:path";

export async function devcontainerName(): Promise<string> {
  const defaultName = path.basename(process.cwd()) || "Solidity Dev Environment";
  const name = await input({
    message: "Name your devcontainer",
    theme: inputStyle,
    default: defaultName,
    validate: (value: string) => {
      const trimmed = (value ?? "").trim();
      if (trimmed.length === 0) return "Name cannot be empty";
      if (trimmed.length > 80) return "Name is too long (max 80 chars)";
      return true;
    },
  });
  return name.trim();
}
