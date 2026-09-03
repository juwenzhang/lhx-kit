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
