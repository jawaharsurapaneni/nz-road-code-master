// Theme preference resolution.
//
// Three preferences are stored: 'system' follows the operating system, while
// 'light' and 'dark' are explicit overrides. Only the resolved value ever
// reaches the DOM, as a data-theme attribute on <html>.
//
// Kept free of DOM references so the rules can be unit-tested directly.

export const THEME_SYSTEM = 'system';
export const THEME_LIGHT = 'light';
export const THEME_DARK = 'dark';

export const THEME_PREFERENCES = Object.freeze([THEME_SYSTEM, THEME_LIGHT, THEME_DARK]);

export function isValidThemePreference(value) {
  return THEME_PREFERENCES.includes(value);
}

/**
 * Turns a stored preference plus the current system setting into the theme
 * that should actually be applied. Anything unrecognised falls back to
 * following the system, which is the safest default.
 */
export function resolveTheme(preference, systemPrefersDark) {
  if (preference === THEME_DARK) return THEME_DARK;
  if (preference === THEME_LIGHT) return THEME_LIGHT;
  return systemPrefersDark ? THEME_DARK : THEME_LIGHT;
}

/**
 * What the header button should switch to. It always sets an explicit
 * preference, because a user who reaches for the toggle wants a decision, not
 * a return to whatever the operating system is doing.
 */
export function toggledPreference(preference, systemPrefersDark) {
  return resolveTheme(preference, systemPrefersDark) === THEME_DARK ? THEME_LIGHT : THEME_DARK;
}

export function themePreferenceLabel(preference) {
  switch (preference) {
    case THEME_LIGHT: return 'Light';
    case THEME_DARK: return 'Dark';
    default: return 'Follow system';
  }
}

/**
 * Label, glyph and accessible name for the header toggle, described in terms
 * of what pressing it will do rather than the state it is currently in.
 */
export function themeToggleDescriptor(preference, systemPrefersDark) {
  const resolved = resolveTheme(preference, systemPrefersDark);
  return resolved === THEME_DARK
    ? { resolved, next: THEME_LIGHT, glyph: '☀', label: 'Light', ariaLabel: 'Switch to the light theme' }
    : { resolved, next: THEME_DARK, glyph: '☾', label: 'Dark', ariaLabel: 'Switch to the dark theme' };
}
