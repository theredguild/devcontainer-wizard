import {
  createPrompt,
  useState,
  useKeypress,
  isUpKey,
  isDownKey,
  isEnterKey,
  usePagination,
} from '@inquirer/core';
import { Separator } from '@inquirer/prompts';
import { symbols } from '@/ui/styling/symbols';
import { colorize } from '@/ui/styling/colors';
import { ui } from '../styling/ui';

type RawChoice<T = any> =
  | string
  | { name?: string; value?: T; description?: string; caveat?: string; disabled?: boolean }
  | Separator;

type PromptConfig<T = any> = {
  message?: string;
  choices?: RawChoice<T>[];
  footer?: {
    back?: boolean;
    exit?: boolean;
  };
  allowBack?: boolean;
}

function normalizeChoices<T>(raw: RawChoice<T>[]) {
  return raw.map((c, idx) => {
    if (c instanceof Separator) {
      
      const separatorText = (c as any).line || 
                           (c as any).separator || 
                           (c as any).name || 
                           (c as any).value ||
                           Object.values(c)[0] ||
                           String(c) || 
                           '--------';
      return { isSeparator: true, name: separatorText, value: undefined, description: undefined, caveat: undefined, disabled: true };
    }
    return typeof c === 'string'
      ? { name: c, value: c as unknown as T, description: undefined, caveat: undefined, disabled: false, isSeparator: false }
      : {
          name: c.name ?? (c.value as any)?.toString() ?? `choice ${idx}`,
          value: c.value ?? (c.name as any),
          description: c.description,
          caveat: c.caveat,
          disabled: !!c.disabled,
          isSeparator: false,
        };
  });
}

export const selectWithTopDescription: any = createPrompt((config: PromptConfig, done: (res: any) => void) => {
  const raw = config.choices ?? [];
  const choices = normalizeChoices(raw);
  
  process.stdout.write('\x1B[?25l');

  const firstIndex = choices.findIndex((c) => !c.disabled && !c.isSeparator);
  const [index, setIndex] = useState(firstIndex === -1 ? 0 : firstIndex);
  const [isDone, setIsDone] = useState(false);
  
  const pagination = usePagination({
    items: choices,
    active: index,
    renderItem: ({ item, isActive }) => {
      if (item.isSeparator) {
        return `${colorize.muted(symbols.separatorIndent + item.name)}`;
      }
      const pointer = isActive ? colorize.brand(symbols.pointer) : ' ';
      const name = item.name ?? String(item.value);
      const disabledTag = item.disabled ? colorize.muted(' (disabled)') : '';
      const styledName = isActive ? colorize.highlight(name) : name;
      return `${pointer} ${styledName}${disabledTag}`;
    },
    pageSize: 10,
    loop: false,
  });

  useKeypress((key: any) => {
    if (isDone) return;
     
    if (isUpKey(key)) {
      let i = index - 1;
      while (i >= 0 && (choices[i].disabled || choices[i].isSeparator)) i -= 1;
      if (i >= 0) {
        setIndex(i);
      }
      return;
    }
    if (isDownKey(key)) {
      let i = index + 1;
      while (i < choices.length && (choices[i].disabled || choices[i].isSeparator)) i += 1;
      if (i < choices.length) {
        setIndex(i);
      }
      return;
    }
    
    if (key.name === 'left' || key.name === 'right') {
      return;
    }
    
    if (isEnterKey(key)) {
      if (choices[index] && !choices[index].disabled && !choices[index].isSeparator) {
        setIsDone(true);
        done(choices[index].value);
      }
      return;
    }

    if (key.name === 'escape' && config.allowBack) {
      done(Symbol.for('back'));
      return;
    }
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    const selected = choices[index];
    return `${colorize.brand(symbols.bullet)} ${config.message ?? ''}\n\n ${colorize.success(symbols.check)} ${colorize.brand(selected.name)}`;
  }

  const msg = config.message ?? '';
  const current = choices[index];
  let currentDesc = '';
  
  if (current?.description && !current.isSeparator) {
    currentDesc += `${colorize.bold(current.description)}`;
    if (current.caveat) {
      currentDesc += `\n${colorize.warning(current.caveat)}`;
    }
    currentDesc += '\n\n';
  } else if (current?.caveat && !current.isSeparator) {
    currentDesc += `${colorize.warning(current.caveat)}\n\n`;
  }

  return `${colorize.brand(symbols.bullet)} ${colorize.brand(msg)}\n\n${currentDesc}${pagination} \n\n${ui.footer(config.footer?.back ?? false, config.footer?.exit ?? true)}`;
});
