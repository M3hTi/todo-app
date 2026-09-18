/**
 * Theme registry — the one place a theme is defined.
 *
 * To add a theme (say Discord):
 *   1. append `{ id: "Discord", paletteClass: "theme-discord", mode: "dark" }` here;
 *   2. add `:root:not(.dark).theme-discord { … }` and `.theme-discord.dark { … }`
 *      blocks to `src/styles/globals.css`, overriding only the tokens that differ
 *      from the built-in light/dark palettes.
 * The picker, the import validator and the `Theme` type all follow automatically.
 */
export interface ThemeOption {
  /** Persisted in settings and shown in the picker — never rename an existing id. */
  id: string;
  /** Class put on <html>; "" = the built-in :root / .dark tokens. */
  paletteClass: string;
  /** "system" follows the OS preference. */
  mode: "light" | "dark" | "system";
}

export const THEMES = [
  { id: "System", paletteClass: "", mode: "system" },
  { id: "Light", paletteClass: "", mode: "light" },
  { id: "Dark", paletteClass: "", mode: "dark" },
  { id: "Claude Light", paletteClass: "theme-claude", mode: "light" },
  { id: "Claude Dark", paletteClass: "theme-claude", mode: "dark" },
] as const satisfies readonly ThemeOption[];

export type Theme = (typeof THEMES)[number]["id"];

/** Non-empty tuple for `z.enum` in the settings-import validator. */
export const THEME_IDS = THEMES.map((theme) => theme.id) as [Theme, ...Theme[]];

/** Every palette class in use — cleared off <html> before the active one goes on. */
export const PALETTE_CLASSES = [
  ...new Set(THEMES.map((theme) => theme.paletteClass).filter((name) => name !== "")),
];

/** Unknown or legacy ids (e.g. a theme removed in a later version) fall back to System. */
export function resolveTheme(theme: string): ThemeOption {
  return THEMES.find((option) => option.id === theme) ?? THEMES[0];
}
