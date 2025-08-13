// Minimal color helpers inspired by The Red Guild palette
// Primary: crimson/lotus (#e11d48)
const RESET = "\x1b[0m";
const BOLD = (s: string) => `\x1b[1m${s}${RESET}`;
const DIM = (s: string) => `\x1b[2m${s}${RESET}`;
const UNDERLINE = (s: string) => `\x1b[4m${s}${RESET}`;

const truecolor = (r: number, g: number, b: number, text: string) => `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;

export const brand = {
  primary: (s: string) => truecolor(225, 29, 72, s), // #e11d48
  accent: (s: string) => truecolor(244, 114, 182, s), // pink-400-ish
  gold: (s: string) => truecolor(234, 179, 8, s), // amber-500
  success: (s: string) => truecolor(34, 197, 94, s), // green-500
  error: (s: string) => truecolor(239, 68, 68, s), // red-500
  muted: (s: string) => truecolor(148, 163, 184, s), // slate-400
  bold: BOLD,
  dim: DIM,
  underline: UNDERLINE,
};

export const icons = {
  cursor: brand.primary('❯'),
  checked: brand.primary('✔'),
  unchecked: brand.muted('◻'),
  prefixIdle: brand.accent('◆'),
  prefixDone: brand.success('◆'),
};

export const spinner = {
  lotus: {
    interval: 80,
    frames: [
      brand.accent('⠋'), brand.accent('⠙'), brand.accent('⠹'), brand.accent('⠸'),
      brand.accent('⠼'), brand.accent('⠴'), brand.accent('⠦'), brand.accent('⠧'),
      brand.accent('⠇'), brand.accent('⠏')
    ],
  },
};
