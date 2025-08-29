import {
  createPrompt,
  useState,
  useKeypress,
  isEnterKey,
} from '@inquirer/core';
import { symbols } from '@/ui/styling/symbols';
import { colorize } from '@/ui/styling/colors';
import { ui } from '@/ui/styling/ui';

type PromptConfig = {
  message?: string;
  default?: boolean;
  theme?: any;
  footer?: {
    back?: boolean;
    exit?: boolean;
  };
  allowBack?: boolean;
};

export const confirmWithFooter: any = createPrompt((config: PromptConfig, done: (res: any) => void) => {
  const [value, setValue] = useState<boolean>(config.default ?? true);
  const [isDone, setIsDone] = useState(false);

  process.stdout.write('\x1B[?25l');

  useKeypress((key: any) => {
    if (isDone) return;

    if (key.name === 'left' || key.name === 'right') {
      setValue(!value);
      return;
    }

    if (key.name === 'y' || key.name === 'Y') {
      setValue(true);
      return;
    }

    if (key.name === 'n' || key.name === 'N') {
      setValue(false);
      return;
    }

    if (key.name === 'escape' && config.allowBack) {
      process.stdout.write('\x1B[?25h');
      done(Symbol.for('back'));
      return;
    }

    if (isEnterKey(key)) {
      setIsDone(true);
      done(value);
      return;
    }
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    const answer = value ? 'Yes' : 'No';
    return `${colorize.brand(symbols.bullet)} ${config.message ?? ''}\n\n ${colorize.success(symbols.check)} ${colorize.brand(answer)}`;
  }

  const msg = config.message ?? '';
  const defaultHint = config.default !== undefined ? 
    (config.default ? ' (Y/n)' : ' (y/N)') : ' (y/N)';
  const answer = value ? colorize.brand('Yes') : colorize.brand('No');
  
  return `${colorize.brand(symbols.bullet)} ${colorize.brand(msg)}${colorize.muted(defaultHint)} ${answer}\n\n${ui.footer(config.footer?.back ?? false, config.footer?.exit ?? true)}`;
});
