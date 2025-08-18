/**
 * Styling system exports
 * Central export point for all styling-related modules
 */

// Core color and styling utilities
export { brand, icons, spinner } from "./colors";

// Theme utilities and factories
export {
  standardPrefix,
  standardSpinner,
  createMessageStyler,
  commonStyles,
  createSelectTheme,
  createInputTheme,
  createCheckBoxTheme,
  formatSelectionCount,
  formatKeyBinding,
} from "./themeUtils";

// Pre-configured component themes
export { selectStyle } from "./selectStyle";
export { inputStyle } from "./inputStyle";
export { checkboxStyle } from "./checkboxStyle";

// Type definitions
export type { SelectTheme, InputTheme, CheckBoxTheme } from "@/types";
