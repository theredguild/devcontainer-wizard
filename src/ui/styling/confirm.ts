import { ConfirmTheme } from "@/types";
import { symbols } from "@/ui/styling/symbols";

export const confirmTheme: ConfirmTheme = {
  prefix: {
    idle: symbols.bullet,
    done: symbols.bullet,
  },
  spinner: {
    interval: symbols.spinner.interval,
    frames: Array.from(symbols.spinner.frames),
  },
  style: {
    answer: (text: string) => text,
    message: (text: string, _status: 'idle' | 'done' | 'loading') => text,
    defaultAnswer: (text: string) => text,
  },
};
