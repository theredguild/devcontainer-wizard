import {
  createPrompt,
  useState,
  useKeypress,
} from '@inquirer/core';
import { symbols } from '@/ui/styling/symbols';
import { colorize } from '@/ui/styling/colors';
import { ui } from '../styling/ui';

type PromptConfig = {
  message?: string;
  default?: string;
  validate?: (input: string) => true | string | Promise<true | string>;
};

function isPrintableKey(key: any) {
  if (!key) return false;
  if (key.ctrl || key.meta) return false;
  const seq: string = key.sequence ?? '';
  if (!seq) return false;
  // Ignore escape sequences (arrows, etc.)
  if (seq.startsWith('\u001b')) return false;
  // Filter out non-printable characters
  return [...seq].every((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 0x20 && code !== 0x7f; 
  });
}

export const inputWithSymbols: any = createPrompt((config: PromptConfig, done: (res: any) => void) => {
  const initial = (config.default ?? '').toString();
  const [value, setValue] = useState<string>('');
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);

    process.stdout.write('\x1B[?25l');

  useKeypress(async (key: any) => {
    if (isDone) return;

    if (key.name === 'backspace' || key.sequence === '\u007f') {
      if (value.length > 0) {
        setValue(value.slice(0, -1));
      }
      return;
    }

    if (key.name === 'left' || key.name === 'right' || key.name === 'up' || key.name === 'down' || key.name === 'tab' || key.name === 'shift' || key.name === 'ctrl' || key.name === 'meta') {
      return;
    }

    if (key.name === 'return' || key.name === 'enter') {
      
      const toValidate = hasStartedTyping ? value : initial;
      if (config.validate) {
        const res = await config.validate(toValidate);
        if (res !== true) {
          setError(typeof res === 'string' ? res : 'Invalid input');
          return;
        }
      }
      setIsDone(true);
      done(toValidate);
      return;
    }

    if (isPrintableKey(key)) {
      setError(undefined);
      if (!hasStartedTyping) {
        setHasStartedTyping(true);
        setValue(key.sequence ?? '');
      } else {
        setValue(value + (key.sequence ?? ''));
      }
      return;
    }
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    const finalValue = hasStartedTyping ? value : initial;
    return `${colorize.brand(symbols.bullet)} ${config.message ?? ''}\n\n ${colorize.success(symbols.check)} ${finalValue}`;
  }

  const msg = config.message ?? '';
  const errorText = error ? `\n${colorize.error(error)}` : '';
  const displayValue = hasStartedTyping ? value : (initial ? colorize.muted(initial) : colorize.muted('_'));
  return `${colorize.brand(symbols.bullet)} ${colorize.brand(msg)} ${displayValue}${errorText} \n\n${ui.footer()}`;
});


