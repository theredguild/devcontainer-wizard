import { inputWithSymbols as input } from "@/ui/components";
import * as path from "node:path";

export async function devcontainerName(state: {name?: string}): Promise<string> {
  
  let defaultName = path.basename(process.cwd());
  
  if (state.name) {
    defaultName = state.name;
  }
  
  if (!defaultName || defaultName.trim().length === 0 || /^[.\s]+$/.test(defaultName)) {
    defaultName = "Devcontainer";
  }
  
  const name = await input({
    message: "Name your devcontainer:",
    default: defaultName,
    validate: (value: string) => {
      const trimmed = (value ?? "").trim();
      if (trimmed.length === 0) return "Name cannot be empty";
      if (trimmed.length > 80) return "Name is too long (max 80 chars)";
      return true;
    },
    footer: {
      back: false,
      exit: true,
    },
    allowBack: false,
  });
  return name.trim();
}
