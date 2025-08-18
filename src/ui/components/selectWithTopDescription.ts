import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isUpKey,
  isDownKey,
  isEnterKey,
  usePagination,
} from '@inquirer/core';
import { Separator } from '@inquirer/prompts';

type RawChoice<T = any> =
  | string
  | { name?: string; value?: T; description?: string; disabled?: boolean }
  | Separator;

type PromptConfig<T = any> = {
  message?: string;
  choices?: RawChoice<T>[];
};

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
      return { isSeparator: true, name: separatorText, value: undefined, description: undefined, disabled: true };
    }
    return typeof c === 'string'
      ? { name: c, value: c as unknown as T, description: undefined, disabled: false, isSeparator: false }
      : {
          name: c.name ?? (c.value as any)?.toString() ?? `choice ${idx}`,
          value: c.value ?? (c.name as any),
          description: c.description,
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
        return `  ${item.name}`;
      }
      const pointer = isActive ? '>' : ' ';
      const name = item.name ?? String(item.value);
      const disabledTag = item.disabled ? ' (disabled)' : '';
      return `${pointer} ${name}${disabledTag}`;
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
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    const selected = choices[index];
    return `$ ${config.message ?? ''}\n ✓ ${selected.name}`;
  }

  const msg = config.message ?? '';
  const current = choices[index];
  const currentDesc = current?.description && !current.isSeparator ? `${current.description}\n` : '';

  return `$ ${msg}\n\n${currentDesc}${pagination}`;
});
