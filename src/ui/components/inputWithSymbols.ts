import {
  createPrompt,
  useState,
  useKeypress,
  useEffect,
  useRef,
} from '@inquirer/core';
import { symbols } from '@/ui/styling/symbols';
import { colorize } from '@/ui/styling/colors';
import { ui } from '../styling/ui';

type PromptConfig = {
  message?: string;
  default?: string;
  validate?: (input: string) => true | string | Promise<true | string>;
  footer?: {
    back?: boolean;
    exit?: boolean;
  };
  allowBack?: boolean;
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
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [hasStartedTyping, setHasStartedTyping] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isDone, setIsDone] = useState(false);
  const [showCursor, setShowCursor] = useState<boolean>(true);
  const showCursorRef = useRef<boolean>(true);

  // Hide system cursor
  process.stdout.write('\x1B[?25l');

  // Blinking cursor effect
  useEffect(() => {
    if (isDone) return;
    
    const interval = setInterval(() => {
      showCursorRef.current = !showCursorRef.current;
      setShowCursor(showCursorRef.current);
    }, 500); // Blink every 500ms

    return () => clearInterval(interval);
  }, [isDone]);

  useKeypress(async (key: any) => {
    if (isDone) return;

    // Handle cursor movement
    if (key.name === 'left') {
      setCursorPosition(Math.max(0, cursorPosition - 1));
      return;
    }

    if (key.name === 'right') {
      setCursorPosition(Math.min(value.length, cursorPosition + 1));
      return;
    }

    if (key.name === 'home') {
      setCursorPosition(0);
      return;
    }

    if (key.name === 'end') {
      setCursorPosition(value.length);
      return;
    }

    if (key.name === 'backspace' || key.sequence === '\u007f') {
      if (!hasStartedTyping) {
        // If user hasn't started typing, clear the default and start fresh
        setHasStartedTyping(true);
        setValue('');
        setCursorPosition(0);
      } else if (cursorPosition > 0) {
        const newValue = value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
        setValue(newValue);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    if (key.name === 'delete') {
      if (!hasStartedTyping) {
        // If user hasn't started typing, clear the default and start fresh
        setHasStartedTyping(true);
        setValue('');
        setCursorPosition(0);
      } else if (cursorPosition < value.length) {
        const newValue = value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
        setValue(newValue);
      }
      return;
    }

    if (key.name === 'up' || key.name === 'down' || key.name === 'tab' || key.name === 'shift' || key.name === 'ctrl' || key.name === 'meta') {
      return;
    }

    if (key.name === 'escape' && config.allowBack) {
      done(Symbol.for('back'));
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
        setCursorPosition(1);
      } else {
        const newValue = value.slice(0, cursorPosition) + (key.sequence ?? '') + value.slice(cursorPosition);
        setValue(newValue);
        setCursorPosition(cursorPosition + 1);
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

  
  
  // Create display value with cursor
  let displayValue: string;
  if (hasStartedTyping) {
    const beforeCursor = value.slice(0, cursorPosition);
    const afterCursor = value.slice(cursorPosition);
    const cursorChar = showCursor ? colorize.brand('|') : ' '; // Blinking cursor indicator
    displayValue = beforeCursor + cursorChar + afterCursor;
  } else {
    // Show cursor even before typing starts
    const cursorChar = showCursor ? colorize.brand('|') : ' '; // Blinking cursor indicator
    if (initial) {
      displayValue = colorize.muted(initial) + cursorChar;
    } else {
      displayValue = cursorChar;
    }
  }
  
  return `${colorize.brand(symbols.bullet)} ${colorize.brand(msg)} ${displayValue}${errorText} \n\n${ui.footer(config.footer?.back ?? false, config.footer?.exit ?? true)}`;
});


