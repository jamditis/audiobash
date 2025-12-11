import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Theme, getThemeById, themes } from './themes';

interface ThemeContextType {
  theme: Theme;
  setTheme: (themeId: string) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('audiobash-theme');
    return savedTheme ? getThemeById(savedTheme) : themes[0];
  });

  // Apply CSS variables to document root
  const applyTheme = useCallback((t: Theme) => {
    const root = document.documentElement;

    // Apply color variables
    root.style.setProperty('--void', t.colors.void);
    root.style.setProperty('--void-100', t.colors.void100);
    root.style.setProperty('--void-200', t.colors.void200);
    root.style.setProperty('--void-300', t.colors.void300);
    root.style.setProperty('--accent', t.colors.accent);
    root.style.setProperty('--accent-glow', t.colors.accentGlow);
    root.style.setProperty('--crt-green', t.colors.crtGreen);
    root.style.setProperty('--crt-amber', t.colors.crtAmber);
    root.style.setProperty('--crt-white', t.colors.crtWhite);

    // Update background and foreground
    document.body.style.backgroundColor = t.colors.void;
    document.body.style.color = t.colors.crtWhite;
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((themeId: string) => {
    const newTheme = getThemeById(themeId);
    setThemeState(newTheme);
    localStorage.setItem('audiobash-theme', themeId);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Helper to convert theme to xterm.js theme options
export const themeToXtermTheme = (theme: Theme) => ({
  background: theme.terminal.background,
  foreground: theme.terminal.foreground,
  cursor: theme.terminal.cursor,
  cursorAccent: theme.terminal.cursorAccent,
  selectionBackground: theme.terminal.selection,
  black: theme.terminal.black,
  red: theme.terminal.red,
  green: theme.terminal.green,
  yellow: theme.terminal.yellow,
  blue: theme.terminal.blue,
  magenta: theme.terminal.magenta,
  cyan: theme.terminal.cyan,
  white: theme.terminal.white,
  brightBlack: theme.terminal.brightBlack,
  brightRed: theme.terminal.brightRed,
  brightGreen: theme.terminal.brightGreen,
  brightYellow: theme.terminal.brightYellow,
  brightBlue: theme.terminal.brightBlue,
  brightMagenta: theme.terminal.brightMagenta,
  brightCyan: theme.terminal.brightCyan,
  brightWhite: theme.terminal.brightWhite,
});
