import { PropsWithChildren, useEffect } from 'react';

import { ThemeProvider, useTheme, type ThemeMode } from '../../theme/ThemeContext';

function StoryThemeSync({ theme, children }: PropsWithChildren<{ theme: ThemeMode }>): JSX.Element {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  return <div data-story-theme={theme}>{children}</div>;
}

export interface StoryThemeProviderProps {
  theme?: ThemeMode;
}

export function StoryThemeProvider({
  theme = 'light',
  children,
}: PropsWithChildren<StoryThemeProviderProps>): JSX.Element {
  return (
    <ThemeProvider>
      <StoryThemeSync theme={theme}>{children}</StoryThemeSync>
    </ThemeProvider>
  );
}

export default StoryThemeProvider;
