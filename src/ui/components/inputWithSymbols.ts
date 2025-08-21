import {
  createPrompt,
  useState,
  useKeypress,
} from '@inquirer/core';
import { symbols } from '@/ui/styling/symbols';

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
    return code >= 0x20 && code !== 0x7f; // printable ASCII excluding DEL
  });
}

export const inputWithSymbols: any = createPrompt((config: PromptConfig, done: (res: any) => void) => {
  const initial = (config.default ?? '').toString();
  const [value, setValue] = useState<string>(initial);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);

  // Hide cursor while interacting
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
      return; // ignore navigation and modifiers
    }

    if (key.name === 'return' || key.name === 'enter') {
      const toValidate = value;
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
      setValue(value + (key.sequence ?? ''));
      return;
    }
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    return `${symbols.bullet} ${config.message ?? ''}  ${symbols.check} ${value}`;
  }

  const msg = config.message ?? '';
  const errorText = error ? `\n${error}` : '';
  return `${symbols.bullet} ${msg} ${value}${errorText}`;
});


