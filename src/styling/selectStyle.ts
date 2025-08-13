import { SelectTheme } from "@/types";
import { brand, icons, spinner } from "@/styling/colors";

export const selectStyle: SelectTheme = {
  prefix: {
    idle: icons.prefixIdle,
    done: icons.prefixDone,
  },
  spinner: spinner.lotus,
  style: {
    answer: (text) => brand.success(brand.bold(text)),
    message: (text, status) => {
      if (status === 'loading') return brand.muted(text);
      if (status === 'done') return brand.success(text);
      return brand.primary(text);
    },
    error: (text) => brand.error(text),
    help: (text) => brand.muted(text),
    highlight: (text) => brand.gold(brand.bold(text)),
    description: (text) => brand.muted(text),
    disabled: (text) => brand.muted(text),
  },
  icon: {
    cursor: icons.cursor,
  },
  helpMode: 'auto',
  indexMode: 'hidden',
};
