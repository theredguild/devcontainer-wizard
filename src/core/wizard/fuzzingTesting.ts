import { checkboxWithTopDescription } from "@/ui/components/checkboxWithTopDescription";

export async function fuzzingAndTesting(state: {fuzzingAndTesting?: string[]}) {
  return await checkboxWithTopDescription ({
    message: "Select fuzzing and testing tools",
    choices: [
      { name: "Echidna", value: "echidna", description: "Automatically installs: Golang, asdf (package manager)", checked: state.fuzzingAndTesting?.includes("echidna") },
      { name: "Medusa", value: "medusa", description: "Automatically installs: Golang, asdf (package manager)", checked: state.fuzzingAndTesting?.includes("medusa") },
      { name: "Halmos", value: "halmos", description: "Automatically installs: Python, uv (package manager)", checked: state.fuzzingAndTesting?.includes("halmos") },
      { name: "Ityfuzz", value: "ityfuzz", description: "Automatically installs: Rust", checked: state.fuzzingAndTesting?.includes("ityfuzz") },  
      { name: "Aderyn", value: "aderyn", description: "Automatically installs: Rust", checked: state.fuzzingAndTesting?.includes("aderyn") }
    ],
    footer: {
      back: true,
      exit: true,
    },
    allowBack: true,
  });
}
