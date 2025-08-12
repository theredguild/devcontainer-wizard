import { checkbox } from "@inquirer/prompts";
import { checkboxStyle } from "@/styling/checkboxStyle";

export async function systemHardening() {
  return await checkbox({
    message: "Select system hardening options",
    theme: checkboxStyle,
    choices: [
      { name: "Read-only file system", value: "readonly-fs", description: "Mounts the file system as read-only" },
    ],
  });
}
