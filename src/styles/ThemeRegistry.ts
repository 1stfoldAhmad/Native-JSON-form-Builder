import type { FormStyleConfig, FormThemeTokens } from '../types';
import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from './defaultThemes';

export interface RegisteredFormTheme {
  id: string;
  name?: string;
  density?: 'compact' | 'comfortable' | 'spacious';
  light: Partial<FormThemeTokens>;
  dark: Partial<FormThemeTokens>;
  style?: FormStyleConfig;
}

/**
 * Registry of named design-token themes for `<ExpoForm />` (`'default'`,
 * `'compact'`, `'high-contrast'`, `'finance-enterprise'`, plus plugin themes).
 */
export class ThemeRegistry {
  private readonly themes = new Map<string, RegisteredFormTheme>();

  constructor(includeBuiltIns = true) {
    if (includeBuiltIns) {
      this.registerBuiltIns();
    }
  }

  private registerBuiltIns(): void {
    this.register({
      id: 'default',
      name: 'Default Native',
      density: 'comfortable',
      light: DEFAULT_LIGHT_THEME,
      dark: DEFAULT_DARK_THEME,
    });

    this.register({
      id: 'compact',
      name: 'Compact Enterprise',
      density: 'compact',
      light: { ...DEFAULT_LIGHT_THEME },
      dark: { ...DEFAULT_DARK_THEME },
      style: {
        form: { spacing: 10, padding: 12 },
        fieldContainer: { spacing: 4 },
        field: { height: 38, borderRadius: 8, fontSize: 14 },
      },
    });

    this.register({
      id: 'high-contrast',
      name: 'High Contrast Accessible',
      density: 'spacious',
      light: {
        ...DEFAULT_LIGHT_THEME,
        background: '#FFFFFF',
        surface: '#FFFFFF',
        textPrimary: '#000000',
        textSecondary: '#111827',
        border: '#000000',
        borderFocused: '#1D4ED8',
        primary: '#000000',
        primaryForeground: '#FFFFFF',
        error: '#B91C1C',
      },
      dark: {
        ...DEFAULT_DARK_THEME,
        background: '#000000',
        surface: '#0A0A0A',
        textPrimary: '#FFFFFF',
        textSecondary: '#F3F4F6',
        border: '#FFFFFF',
        borderFocused: '#93C5FD',
        primary: '#FFFFFF',
        primaryForeground: '#000000',
        error: '#FCA5A5',
      },
      style: {
        field: { borderWidth: 2, height: 50, fontSize: 17 },
      },
    });

    this.register({
      id: 'finance-enterprise',
      name: 'Finance Enterprise',
      density: 'comfortable',
      light: {
        ...DEFAULT_LIGHT_THEME,
        seedColor: '#0F766E',
        borderFocused: '#0F766E',
        primary: '#0F766E',
        primaryForeground: '#FFFFFF',
        surfaceMuted: '#F0FDFA',
      },
      dark: {
        ...DEFAULT_DARK_THEME,
        seedColor: '#2DD4BF',
        borderFocused: '#2DD4BF',
        primary: '#2DD4BF',
        primaryForeground: '#042F2E',
      },
    });
  }

  register(theme: RegisteredFormTheme): () => void {
    this.themes.set(theme.id, theme);
    return () => {
      this.themes.delete(theme.id);
    };
  }

  get(id: string): RegisteredFormTheme | undefined {
    return this.themes.get(id);
  }

  has(id: string): boolean {
    return this.themes.has(id);
  }

  list(): string[] {
    return Array.from(this.themes.keys());
  }
}

export const defaultThemeRegistry = new ThemeRegistry(true);
