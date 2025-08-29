import { colorize } from './colors';
import { symbols } from './symbols';

// Common UI patterns and layouts
export const ui = {
  // Screen utilities
  clearScreen: () => {
    // Clear screen and scrollback buffer
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
  },
  
  // Header and footer
  header: () => {
    const title = `${colorize.brand('✻')} ${colorize.highlight('Devcontainer Wizard by The Red Guild 🪷')}`;
    return `${title}`;
  },
  
  footer: (back: boolean = false, exit: boolean = true) => {
    const commands = [];
    if (back) commands.push(`ESC ${colorize.muted('Back')}`);
    if (exit) commands.push(`CTRL+C ${colorize.muted('Exit')}`);
    
    if (commands.length === 0) return '';
    
    const commandText = commands.join('  ');
    return `\n` +
           `${colorize.muted('Shortcuts:')} ${commandText}`;
  },
  
  // Section headers
  sectionHeader: (title: string) => `${colorize.brand(symbols.diamond)} ${colorize.highlight(title)}`,
  
  // Status indicators
  status: {
    success: (text: string) => `${colorize.success(symbols.check)} ${text}`,
    error: (text: string) => `${colorize.error(symbols.circle)} ${text}`,
    warning: (text: string) => `${colorize.warning(symbols.triangle)} ${text}`,
    info: (text: string) => `${colorize.brand(symbols.bullet)} ${text}`,
  },
  
  // Progress indicators
  progress: {
    step: (current: number, total: number, label: string) => 
      `${colorize.muted(`[${current}/${total}]`)} ${colorize.brand(label)}`,
    complete: (label: string) => `${colorize.success(symbols.check)} ${colorize.success(label)}`,
  },
  
  // Lists and items
  list: {
    item: (text: string, active: boolean = false) => 
      active ? colorize.highlight(`  ${symbols.pointer} ${text}`) : `  ${text}`,
    selected: (text: string) => `${colorize.success(symbols.check)} ${colorize.brand(text)}`,
    disabled: (text: string) => `${colorize.muted(text)} (disabled)`,
  },
  
  // Separators and dividers
  separator: (text?: string) => 
    text ? colorize.muted(`── ${text} ──`) : colorize.muted('─'.repeat(40)),
  
  // Input styling
  input: {
    label: (text: string) => colorize.brand(text),
    value: (text: string) => colorize.brand(text),
    placeholder: (text: string) => colorize.muted(text),
    error: (text: string) => colorize.error(text),
  },
  
  // Navigation
  navigation: {
    back: () => colorize.muted(`← Back`),
    next: () => colorize.brand(`Next →`),
    cancel: () => colorize.error(`Cancel`),
    confirm: () => colorize.success(`Confirm`),
  },
} as const;
