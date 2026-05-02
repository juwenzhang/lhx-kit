export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeTokens {
  [token: string]: string | number;
}

export interface ThemeDefinition {
  name: string;
  mode: 'light' | 'dark';
  tokens: ThemeTokens;
}

export interface ThemeOptions {
  themes: ThemeDefinition[];
  defaultName?: string;
  mode?: ThemeMode;
  prefix?: string;
}

export interface ThemeController {
  apply(name: string, mode?: ThemeMode): void;
  current(): {name: string; mode: ThemeMode};
}

function applyTokens(tokens: ThemeTokens, prefix: string): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  for (const [key, value] of Object.entries(tokens)) {
    style.setProperty(`--${prefix}-${key}`, String(value));
  }
}

export function createTheme(options: ThemeOptions): ThemeController {
  const prefix = options.prefix || 'lhx';
  const byName = new Map(options.themes.map(theme => [theme.name, theme]));
  let currentName = options.defaultName || options.themes[0]?.name || 'default';
  let currentMode: ThemeMode = options.mode || 'light';

  function resolveMode(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'auto' && typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return mode === 'dark' ? 'dark' : 'light';
  }

  function apply(name: string, mode: ThemeMode = currentMode): void {
    const theme = byName.get(name);
    if (!theme) return;
    currentName = name;
    currentMode = mode;
    const resolved = resolveMode(mode);
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = `${name}-${resolved}`;
    }
    applyTokens(theme.tokens, prefix);
  }

  apply(currentName, currentMode);

  return {
    apply,
    current: () => ({name: currentName, mode: currentMode})
  };
}
