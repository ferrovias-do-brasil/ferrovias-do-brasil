/**
 * Light/dark theme. The visitor's choice ("auto", "light", "dark") is kept in
 * localStorage; "auto" follows the operating system. The <html data-theme>
 * attribute is set only for an explicit choice (see global.css).
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'ferrovias-tema';
export const THEME_EVENT = 'themechange';

export function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function effectiveTheme(choice: ThemeChoice = readChoice()): Theme {
  if (choice !== 'auto') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Calls `cb` with the effective theme now and whenever it changes. Returns an unsubscribe function. */
export function onThemeChange(cb: (theme: Theme) => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const fire = () => cb(effectiveTheme());
  window.addEventListener(THEME_EVENT, fire);
  media.addEventListener('change', fire);
  fire();
  return () => {
    window.removeEventListener(THEME_EVENT, fire);
    media.removeEventListener('change', fire);
  };
}
