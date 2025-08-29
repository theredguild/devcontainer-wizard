import { inputWithSymbols as input } from "@/ui/components";
import * as path from "node:path";
import * as fs from "node:fs/promises";

export async function savePath(): Promise<string> {
  const answer = await input({
    message: "Select a directory to save the devcontainer files",
    default: process.cwd(),
    validate: async (value: string) => {
      try {
        const resolved = path.resolve(value.trim() || ".");
        const stats = await fs.stat(resolved).catch(() => undefined);
        if (!stats) {
          // Allow non-existing; we'll create it later when generating files
          return true;
        }
        if (!stats.isDirectory()) {
          return "Path exists but is not a directory";
        }
        return true;
      } catch (e) {
        return "Invalid path";
      }
    },
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true
  });

  if ((answer as any) === Symbol.for('back')) {
    return Symbol.for('back') as any;
  }

  return path.resolve(answer.trim() || ".");
}
