import { InputTheme } from "@/types";
import { brand } from "@/styling/colors";

export const inputStyle: InputTheme = {
  prefix: {
    idle: brand.accent('◆'),
    done: brand.success('◆'),
  },
  spinner: {
    interval: 80,
    frames: [brand.accent('⠋'), brand.accent('⠙'), brand.accent('⠹'), brand.accent('⠸'), brand.accent('⠼'), brand.accent('⠴'), brand.accent('⠦'), brand.accent('⠧'), brand.accent('⠇'), brand.accent('⠏')],
  },
  style: {
    answer: (text) => brand.success(brand.bold(text)),
    message: (text, status) => {
      if (status === 'loading') return brand.muted(text);
      if (status === 'done') return brand.success(text);
      return brand.primary(text);
    },
    error: (text) => brand.error(text),
    defaultAnswer: (text) => brand.muted(text),
  },
  validationFailureMode: 'keep',
};
