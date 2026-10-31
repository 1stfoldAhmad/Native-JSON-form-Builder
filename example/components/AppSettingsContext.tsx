import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface AppSettingsValue {
  locale: 'en' | 'ur';
  colorScheme: 'light' | 'dark';
  setLocale: (locale: 'en' | 'ur') => void;
  setColorScheme: (scheme: 'light' | 'dark') => void;
  toggleLocale: () => void;
  toggleColorScheme: () => void;
}

const AppSettingsContext = createContext<AppSettingsValue>({
  locale: 'en',
  colorScheme: 'light',
  setLocale: () => {},
  setColorScheme: () => {},
  toggleLocale: () => {},
  toggleColorScheme: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<'en' | 'ur'>('en');
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');

  const value = useMemo<AppSettingsValue>(
    () => ({
      locale,
      colorScheme,
      setLocale,
      setColorScheme,
      toggleLocale: () => setLocale((prev) => (prev === 'en' ? 'ur' : 'en')),
      toggleColorScheme: () =>
        setColorScheme((prev) => (prev === 'light' ? 'dark' : 'light')),
    }),
    [locale, colorScheme]
  );

  return (
    <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettingsValue {
  return useContext(AppSettingsContext);
}
