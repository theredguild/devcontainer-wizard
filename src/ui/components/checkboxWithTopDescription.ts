import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isEnterKey,
  usePagination,
} from '@inquirer/core';
import { Separator } from '@inquirer/prompts';
import { symbols } from '@/ui/styling/symbols';

type RawChoice<T = any> =
  | string
  | { name?: string; value?: T; description?: string; disabled?: boolean; checked?: boolean }
  | Separator;

type PromptConfig<T = any> = {
  message?: string;
  choices?: RawChoice<T>[];
};

function normalizeChoices<T>(raw: RawChoice<T>[]) {
  return raw.map((c, idx) => {
    if (c instanceof Separator) {
      // Try different ways to access separator text
      const separatorText = (c as any).line || 
                           (c as any).separator || 
                           (c as any).name || 
                           (c as any).value ||
                           Object.values(c)[0] ||
                           String(c) || 
                           '--------';
      return { isSeparator: true, name: separatorText, value: undefined, description: undefined, disabled: true, checked: false };
    }
    return typeof c === 'string'
      ? { name: c, value: c as unknown as T, description: undefined, disabled: false, checked: false, isSeparator: false }
      : {
          name: c.name ?? (c.value as any)?.toString() ?? `choice ${idx}`,
          value: c.value ?? (c.name as any),
          description: c.description,
          disabled: !!c.disabled,
          checked: !!c.checked,
          isSeparator: false,
        };
  });
}

export const checkboxWithTopDescription: any = createPrompt((config: PromptConfig, done: (res: any) => void) => {
  const raw = config.choices ?? [];
  const choices = normalizeChoices(raw);
  
  process.stdout.write('\x1B[?25l');

  const firstIndex = choices.findIndex((c) => !c.disabled && !c.isSeparator);
  const [index, setIndex] = useState(firstIndex === -1 ? 0 : firstIndex);
  const [isDone, setIsDone] = useState(false);
  const initialChecked = new Set<number>();
  choices.forEach((c, i) => {
    if (c.checked) initialChecked.add(i);
  });
  const [checkedSet, setCheckedSet] = useState<Set<number>>(initialChecked);
  
  const pagination = usePagination({
    items: choices,
    active: index,
    renderItem: ({ item, isActive, index: itemIndex }) => {
      if (item.isSeparator) {
        return `${symbols.separatorIndent.repeat(3)}${item.name}`;
      }
      const pointer = isActive ? symbols.pointer : ' ';
      const box = item.disabled ? symbols.checkbox.disabled : checkedSet.has(itemIndex) ? symbols.checkbox.checked : symbols.checkbox.unchecked;
      const name = item.name ?? String(item.value);
      const disabledTag = item.disabled ? ' (disabled)' : '';
      return `${pointer} ${box} ${name}${disabledTag}`;
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
    
    if (key.name === 'left') {
      return;
    }
    
    if (isSpaceKey(key) || key.name === 'right') {
      if (choices[index] && !choices[index].disabled && !choices[index].isSeparator) {
        const nextCheckedSet = new Set(checkedSet);
        if (nextCheckedSet.has(index)) {
          nextCheckedSet.delete(index);
        } else {
          nextCheckedSet.add(index);
        }
        setCheckedSet(nextCheckedSet);
      }
      return;
    }
    if (isEnterKey(key)) {
      setIsDone(true);
      const result = Array.from(checkedSet)
        .sort((a, b) => a - b)
        .map((i) => choices[i].value);
      done(result);
      return;
    }
  });

  if (isDone) {
    process.stdout.write('\x1B[?25h');
    const selectedCount = checkedSet.size;
    return `${symbols.bullet} ${config.message ?? ''}\n ${symbols.check} ${selectedCount} selected`;
  }

  const msg = config.message ?? '';
  const current = choices[index];
  const currentDesc = current?.description && !current.isSeparator ? `${current.description}\n\n` : '';

  return `${symbols.bullet} ${msg}\n\n${currentDesc}${pagination}`;
});