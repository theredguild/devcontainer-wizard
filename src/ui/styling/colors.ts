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
  salmon: [239, 149, 157] as const,     // #EF959D- Primary brand color
  pinkGlamour: [255, 118, 117] as const, // #FF7675 - Accent color
  amber: [234, 179, 8] as const,       // #eab308 - Warning/highlight color
  
  // Semantic colors
  emerald: [46, 204, 113] as const,       // #2ecc71 - Success color
  alizarin: [231, 76, 60] as const,      // #e74c3c - Error color
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
  primary: (s: string) => truecolor(...COLORS.salmon, s),
  
  /** Accent color (pink) - use for secondary actions and highlights */
  accent: (s: string) => truecolor(...COLORS.pinkGlamour, s),
  
  /** Gold/amber color - use for warnings, important highlights, and selected states */
  gold: (s: string) => truecolor(...COLORS.amber, s),
  
  /** Success color (green) - use for completed states and positive feedback */
  success: (s: string) => truecolor(...COLORS.emerald, s),
  
  /** Error color (red) - use for errors and destructive actions */
  error: (s: string) => truecolor(...COLORS.alizarin, s),
  
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
  cursor: brand.primary('▸'),
  
  /** Filled checkbox for completed/selected items */
  checked: brand.primary('[x]'),
  
  /** Empty checkbox for unselected items */
  unchecked: brand.muted('[ ]'),
  
  /** Hyphen prefix for idle states */
  prefixIdle: brand.accent('•'),
  
  /** Diamond prefix for completed states */
  prefixDone: brand.accent('✓'),
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
