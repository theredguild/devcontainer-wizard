/**
 * Color system for web3-devcontainer-cli
 * Inspired by The Red Guild palette with crimson/lotus as primary color
 */

// =============================================================================
// ANSI Escape Codes
// =============================================================================

/** Reset all ANSI formatting */
const RESET = "\x1b[0m";

/** Text formatting helpers */
const BOLD = (s: string) => `\x1b[1m${s}${RESET}`;
const DIM = (s: string) => `\x1b[2m${s}${RESET}`;
const UNDERLINE = (s: string) => `\x1b[4m${s}${RESET}`;

/**
 * Create a truecolor ANSI escape sequence
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @param text Text to colorize
 * @returns Colored text with reset sequence
 */
const truecolor = (r: number, g: number, b: number, text: string): string => 
  `\x1b[38;2;${r};${g};${b}m${text}${RESET}`;

// =============================================================================
// Color Palette
// =============================================================================

/** 
 * Core color palette based on Tailwind CSS color system
 * All colors use RGB values for consistency
 */
const COLORS = {
  // Brand colors
  crimson: [225, 29, 72] as const,     // #e11d48 - Primary brand color
  pink: [244, 114, 182] as const,      // #f472b6 - Accent color
  amber: [234, 179, 8] as const,       // #eab308 - Warning/highlight color
  
  // Semantic colors
  green: [34, 197, 94] as const,       // #22c55e - Success color
  red: [239, 68, 68] as const,         // #ef4444 - Error color
  slate: [148, 163, 184] as const,     // #94a3b8 - Muted/secondary color
} as const;

// =============================================================================
// Brand Color Functions
// =============================================================================

/**
 * Brand color system providing semantic color functions
 * Each function takes a string and returns it styled with the appropriate color
 */
export const brand = {
  /** Primary brand color (crimson) - use for main actions and focus states */
  primary: (s: string) => truecolor(...COLORS.crimson, s),
  
  /** Accent color (pink) - use for secondary actions and highlights */
  accent: (s: string) => truecolor(...COLORS.pink, s),
  
  /** Gold/amber color - use for warnings, important highlights, and selected states */
  gold: (s: string) => truecolor(...COLORS.amber, s),
  
  /** Success color (green) - use for completed states and positive feedback */
  success: (s: string) => truecolor(...COLORS.green, s),
  
  /** Error color (red) - use for errors and destructive actions */
  error: (s: string) => truecolor(...COLORS.red, s),
  
  /** Muted color (slate) - use for secondary text and disabled states */
  muted: (s: string) => truecolor(...COLORS.slate, s),
  
  // Text formatting utilities
  /** Make text bold */
  bold: BOLD,
  
  /** Make text dim/faded */
  dim: DIM,
  
  /** Add underline to text */
  underline: UNDERLINE,
} as const;

// =============================================================================
// Icon System
// =============================================================================

/**
 * Consistent icon system using Unicode characters
 * Icons are pre-styled with appropriate brand colors
 */
export const icons = {
  /** Cursor/pointer icon for active selection */
  cursor: brand.primary('❯'),
  
  /** Checkmark for completed/selected items */
  checked: brand.primary('✔'),
  
  /** Empty checkbox for unselected items */
  unchecked: brand.muted('◻'),
  
  /** Diamond prefix for idle states */
  prefixIdle: brand.accent('◆'),
  
  /** Diamond prefix for completed states */
  prefixDone: brand.success('◆'),
} as const;

// =============================================================================
// Loading Spinner
// =============================================================================

/**
 * Spinner configurations for loading states
 * Uses braille patterns for smooth animation
 */
export const spinner = {
  /** Primary lotus spinner with accent color */
  lotus: {
    /** Animation interval in milliseconds */
    interval: 80,
    
    /** Braille pattern frames for smooth rotation effect */
    frames: [
      brand.accent('⠋'), brand.accent('⠙'), brand.accent('⠹'), brand.accent('⠸'),
      brand.accent('⠼'), brand.accent('⠴'), brand.accent('⠦'), brand.accent('⠧'),
      brand.accent('⠇'), brand.accent('⠏')
    ],
  },
} as const;
