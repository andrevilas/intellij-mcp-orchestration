import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (value: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'mcp-console-theme';

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function applyThemeClass(theme: Theme) {
  if (typeof document === 'undefined') {
    return;
  }
  document.body.classList.toggle('theme-dark', theme === 'dark');
  document.body.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getPreferredTheme());

  useLayoutEffect(() => {
    applyThemeClass(theme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((value: Theme) => {
    setThemeState(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
