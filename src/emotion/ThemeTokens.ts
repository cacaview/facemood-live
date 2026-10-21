import type { EmotionLabel } from "./controller";
import { EmotionRegistry } from "./registry";

export type ThemeTokens = Record<
  "--mood-primary" | "--mood-secondary" | "--mood-background",
  string
>;

export function createThemeTokens(label: EmotionLabel): ThemeTokens {
  const { primary, secondary, background } = EmotionRegistry[label].palette;
  return {
    "--mood-primary": primary,
    "--mood-secondary": secondary,
    "--mood-background": background,
  };
}
