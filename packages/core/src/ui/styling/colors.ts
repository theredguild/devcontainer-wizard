export const colors = {
    // Brand colors
    salmon: [239, 149, 157] as const,     // #EF959D- Primary brand color
    pinkGlamour: [255, 118, 117] as const, // #FF7675 - Accent color
    amber: [234, 179, 8] as const,       // #eab308 - Warning/highlight color
    
    // Semantic colors
    emerald: [46, 204, 113] as const,       // #2ecc71 - Success color
    alizarin: [231, 76, 60] as const,      // #e74c3c - Error color
    slate: [148, 163, 184] as const,     // #94a3b8 - Muted/secondary color

    // Formatting
    bold: '\x1b[1m',
    muted: '\x1b[90m',
    reset: '\x1b[0m',
} as const; 

// Utility functions for RGB to ANSI conversion
export const rgbToAnsi = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;

// Semantic color functions
export const colorize = {
    brand: (text: string) => `${rgbToAnsi(...colors.salmon)}${text}${colors.reset}`,
    accent: (text: string) => `${rgbToAnsi(...colors.pinkGlamour)}${text}${colors.reset}`,
    warning: (text: string) => `${rgbToAnsi(...colors.amber)}${text}${colors.reset}`,
    success: (text: string) => `${rgbToAnsi(...colors.emerald)}${text}${colors.reset}`,
    error: (text: string) => `${rgbToAnsi(...colors.alizarin)}${text}${colors.reset}`,
    muted: (text: string) => `${rgbToAnsi(...colors.slate)}${text}${colors.reset}`,
    bold: (text: string) => `${colors.bold}${text}${colors.reset}`,
    highlight: (text: string) => `${colors.bold}${rgbToAnsi(...colors.salmon)}${text}${colors.reset}`,
} as const;