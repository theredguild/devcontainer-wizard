import { ConfirmTheme } from "@/types";
import { symbols } from "@/ui/styling/symbols";
import { colorize } from "@/ui/styling/colors";

export const confirmTheme: ConfirmTheme = {
  prefix: {
    idle: colorize.brand(symbols.bullet),
    done: colorize.success(symbols.check),
  },
  spinner: {
    interval: symbols.spinner.interval,
    frames: Array.from(symbols.spinner.frames),
  },
  style: {
    answer: (text: string) => colorize.brand(text),
    message: (text: string, status: 'idle' | 'done' | 'loading') => {
      switch (status) {
        case 'done':
          return colorize.success(text);
        case 'loading':
          return colorize.warning(text);
        default:
          return colorize.brand(text);
      }
    },
    defaultAnswer: (text: string) => colorize.muted(text),
  },
};
