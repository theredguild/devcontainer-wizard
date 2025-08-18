import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";
import { checkboxStyle } from "@/ui/styling/checkboxStyle";

export async function fuzzingAndTesting() {
  return await checkboxWithTopDescription ({
    message: "Select fuzzing and testing tools",
    theme: checkboxStyle,
    choices: [
      { name: "Echidna", value: "echidna", description: "Automatically installs: Golang, asdf (package manager)" },
      { name: "Medusa", value: "medusa", description: "Automatically installs: Golang, asdf (package manager)" },
      { name: "Halmos", value: "halmos", description: "Automatically installs: Python, uv (package manager)" },
      { name: "Ityfuzz", value: "ityfuzz", description: "Automatically installs: Rust" },  
      { name: "Aderyn", value: "aderyn", description: "Automatically installs: Rust" }
    ],
  });
}
