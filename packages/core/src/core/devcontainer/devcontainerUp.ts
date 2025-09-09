import { spawn } from 'node:child_process'
import { colorize } from '@/ui/styling/colors';
import { symbols } from '@/ui/styling/symbols';

export async function devcontainerUp(devcontainerConfig: string) {
  
  const { containerId } = await new Promise<{ containerId: string; }>((resolve, reject) => {
    const child = spawn(
      'npx',
      ['@devcontainers/cli', 'up', '--config', devcontainerConfig, '--workspace-folder', '.']
    );

    let output = '';
    let errorOutput = '';
    let logLines: string[] = [];
    let frameIndex = 0;
    let spinnerInterval: NodeJS.Timeout | null = null;

    // Function to update the 5-line display
    const updateDisplay = () => {
      // Clear previous lines and move cursor up
      process.stdout.write('\x1B[5A\x1B[0J'); // Move up 5 lines and clear from cursor to end
      
      // Show spinner and building message
      process.stdout.write(`\r${colorize.muted(symbols.spinner.frames[frameIndex])} Building devcontainer to finish setup...\n`);
      
      // Show last 4 log lines
      for (let i = 0; i < 4; i++) {
        const line = logLines[logLines.length - 4 + i] || '';
        const truncatedLine = line.length > 80 ? line.substring(0, 77) + '...' : line;
        process.stdout.write(`\r${colorize.muted('  ' + truncatedLine)}\n`);
      }
      
      frameIndex = (frameIndex + 1) % symbols.spinner.frames.length;
    };

    // Start the spinner
    spinnerInterval = setInterval(updateDisplay, symbols.spinner.interval);
    
    child.stdout.on('data', (data) => {
      const newOutput = data.toString();
      output += newOutput;
      
      // Split into lines and add to logLines
      const lines = newOutput.split('\n').filter((line: string) => line.trim());
      logLines.push(...lines);
      
      // Keep only last 50 lines to avoid memory issues
      if (logLines.length > 50) {
        logLines = logLines.slice(-50);
      }
    });

    child.stderr.on('data', (data) => {
      const newErrorOutput = data.toString();
      errorOutput += newErrorOutput;
      
      // Also add stderr to log lines
      const lines = newErrorOutput.split('\n').filter((line: string) => line.trim());
      logLines.push(...lines);
      
      // Keep only last 50 lines to avoid memory issues
      if (logLines.length > 50) {
        logLines = logLines.slice(-50);
      }
    });

    child.on('error', (err) => {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
      }
      reject(err);
    });

    child.on('close', (code) => {
      // Stop the spinner
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
      }
      
      // Clear the 5-line display
      process.stdout.write('\x1B[5A\x1B[0J');
      
      if (code !== 0) {
        return reject(new Error(`'devcontainer up' exited with code ${code}:\n${errorOutput}`));
      }

      try {
        const jsonMatch = output.match(/({[\s\S]*})/);
        if (!jsonMatch) {
            return reject(new Error('Could not find JSON output from devcontainer CLI.'));
        }
        
        const result = JSON.parse(jsonMatch[1]);

        if (result.outcome !== 'success' || !result.containerId) {
          return reject(new Error(`Dev container setup failed or did not return expected info. Output:\n${output}`));
        }
        
        resolve({
            containerId: result.containerId,
        });

      } catch (e) {
        reject(new Error(`Failed to parse JSON from devcontainer CLI output: ${e}\nOutput was:\n${output}`));
      }
    });
  });

  return containerId;
}