/**
 * Shared theme utilities for consistent UI component styling
 * Provides common patterns and factories for theme creation
 */

import { brand, icons, spinner } from "@/ui/styling/colors";
import type { SelectTheme, InputTheme, CheckBoxTheme } from "@/types";

// =============================================================================
// Common Theme Patterns
// =============================================================================

/**
 * Standard prefix configuration used across all interactive components
 * Provides consistent visual states for idle and completed interactions
 */
export const standardPrefix = {
  idle: icons.prefixIdle,
  done: icons.prefixDone,
} as const;

/**
 * Standard spinner configuration for loading states
 * Uses the lotus spinner pattern with consistent timing
 */
export const standardSpinner = {
  interval: spinner.lotus.interval,
  frames: [...spinner.lotus.frames],
};

/**
 * Common message styling function that handles different interaction states
 * @param text - The text to style
 * @param status - Current interaction status
 * @returns Styled text based on status
 */
export const createMessageStyler = () => (
  text: string, 
  status: 'idle' | 'done' | 'loading'
): string => {
  switch (status) {
    case 'loading':
      return brand.muted(text);
    case 'done':
      return brand.success(text);
    default:
      return brand.primary(text);
  }
};

/**
 * Standard styling functions used across multiple theme types
 * Provides consistent visual treatment for common text elements
 */
export const commonStyles = {
  /** Style for user answers/selections */
  answer: (text: string) => brand.success(brand.bold(text)),
  
  /** Style for error messages */
  error: (text: string) => brand.error(text),
  
  /** Style for help text and descriptions */
  help: (text: string) => brand.muted(text),
  
  /** Style for highlighted/focused elements */
  highlight: (text: string) => brand.gold(brand.bold(text)),
  
  /** Style for descriptive text */
  description: (text: string) => brand.muted(text),
  
  /** Style for disabled/muted choices */
  disabled: (text: string) => brand.muted(text),
  
  /** Style for default/placeholder answers */
  defaultAnswer: (text: string) => brand.muted(text),
  
  /** Message styler with state handling */
  message: createMessageStyler(),
} as const;

// =============================================================================
// Theme Factory Functions
// =============================================================================

/**
 * Creates a base theme configuration with common elements
 * This reduces duplication across different input component types
 */
const createBaseTheme = () => ({
  prefix: standardPrefix,
  spinner: standardSpinner,
  style: {
    answer: commonStyles.answer,
    message: commonStyles.message,
    error: commonStyles.error,
    help: commonStyles.help,
    description: commonStyles.description,
  },
});

/**
 * Factory function to create a select theme with optional customizations
 * @param overrides - Optional theme property overrides
 * @returns Complete SelectTheme configuration
 */
export const createSelectTheme = (overrides: Partial<SelectTheme> = {}): SelectTheme => ({
  ...createBaseTheme(),
  style: {
    ...createBaseTheme().style,
    highlight: commonStyles.highlight,
    disabled: commonStyles.disabled,
  },
  icon: {
    cursor: icons.cursor,
  },
  helpMode: 'auto' as const,
  indexMode: 'hidden' as const,
  ...overrides,
});

/**
 * Factory function to create an input theme with optional customizations
 * @param overrides - Optional theme property overrides
 * @returns Complete InputTheme configuration
 */
export const createInputTheme = (overrides: Partial<InputTheme> = {}): InputTheme => ({
  ...createBaseTheme(),
  style: {
    ...createBaseTheme().style,
    defaultAnswer: commonStyles.defaultAnswer,
  },
  validationFailureMode: 'keep' as const,
  ...overrides,
});

/**
 * Factory function to create a checkbox theme with optional customizations
 * @param overrides - Optional theme property overrides
 * @returns Complete CheckBoxTheme configuration
 */
export const createCheckBoxTheme = (overrides: Partial<CheckBoxTheme> = {}): CheckBoxTheme => ({
  ...createBaseTheme(),
  style: {
    ...createBaseTheme().style,
    highlight: commonStyles.highlight,
    key: (text: string) => brand.accent(text),
    disabledChoice: commonStyles.disabled,
    defaultAnswer: commonStyles.defaultAnswer,
    renderSelectedChoices: (selectedChoices) =>
      `${brand.success('✔')} ${brand.bold(String(selectedChoices.length))} selected`,
  },
  icon: {
    checked: icons.checked,
    unchecked: icons.unchecked,
    cursor: icons.cursor,
  },
  helpMode: 'auto' as const,
  ...overrides,
});

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Helper function to create consistent selection count displays
 * @param count - Number of selected items
 * @param label - Label for the items (default: "selected")
 * @returns Formatted selection count string
 */
export const formatSelectionCount = (count: number, label: string = 'selected'): string =>
  `${brand.success('✔')} ${brand.bold(String(count))} ${label}`;

/**
 * Helper function to create consistent key binding displays
 * @param key - The key or key combination
 * @param description - Description of what the key does
 * @returns Formatted key binding string
 */
export const formatKeyBinding = (key: string, description: string): string =>
  `${brand.accent(key)} ${brand.muted(description)}`;
