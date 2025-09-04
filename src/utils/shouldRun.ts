import { confirmWithFooter as confirm } from "@/ui/components";
import { colorize } from "@/ui/styling/colors";
import { symbols } from "@/ui/styling/symbols";
import { ui } from "@/ui/styling/ui";
import { openIn } from "@/utils/openIn";
import { devcontainerUp, devcontainerExec } from "@/core/devcontainer";

export async function shouldRun(devcontainerPath: string) {
  try {
    const shouldRun = await confirm({
      message: colorize.brand(symbols.diamond + ' Would you like to start the devcontainer now?'),
      default: true,
      footer: {
        back: true,
        exit: true,
      },
      allowBack: true
    });

    if ((shouldRun as any) === Symbol.for('back')) {
      return Symbol.for('back') as any;
    }

    const containerId = await devcontainerUp(devcontainerPath);
    
    if (shouldRun) {
        ui.clearScreen()
        const openInSelection = await openIn();
        await devcontainerExec(containerId, openInSelection);
    } else {
      console.log(colorize.brand(symbols.diamond + ' You can start it later with:'));
      console.log("npx @devcontainers/cli exec --container-id " + containerId + " bash -lc 'cd /workspace && exec bash -l'");
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'User force closed the prompt with SIGINT' || error.message === 'User force closed the prompt with SIGTERM')) {
      console.log('\nExited with CTRL+C 👋')
      process.exit(0)
    }
    throw error;
  }
}