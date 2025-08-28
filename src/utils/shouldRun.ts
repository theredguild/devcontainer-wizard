import { confirmWithFooter as confirm } from "@/ui/components";
import { colorize } from "@/ui/styling/colors";
import { symbols } from "@/ui/styling/symbols";
import { ui } from "@/ui/styling/ui";
import { openIn } from "@/utils/openIn";
import { devcontainerUp, devcontainerExec } from "@/core/devcontainer";

export async function shouldRun(devcontainerPath: string) {
    const shouldRun = await confirm({
    message: colorize.brand(symbols.diamond + ' Would you like to start the devcontainer now?'),
    default: true
  });

  process.stdout.write(colorize.muted(symbols.circle + ' Building devcontainer...'));
  let frameIndex = 0;
  const spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${colorize.muted(symbols.spinner.frames[frameIndex])} Building devcontainer...`);
    frameIndex = (frameIndex + 1) % symbols.spinner.frames.length;
  }, symbols.spinner.interval);

  const containerId = await devcontainerUp(devcontainerPath);

  clearInterval(spinnerInterval);
  process.stdout.write('\n');
  
  if (shouldRun) {
      ui.clearScreen()
      const openInSelection = await openIn();
      await devcontainerExec(containerId, openInSelection);
  } else {
    console.log(colorize.brand(symbols.diamond + ' You can start it later with:'));
    console.log("npx @devcontainers/cli exec --container-id " + containerId + " bash -lc 'cd /workspace && exec bash -l'");
  }
}