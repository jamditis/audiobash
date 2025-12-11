export interface Theme {
  id: string;
  name: string;
  colors: {
    void: string;
    void100: string;
    void200: string;
    void300: string;
    accent: string;
    accentGlow: string;
    crtGreen: string;
    crtAmber: string;
    crtWhite: string;
  };
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selection: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const themes: Theme[] = [
  {
    id: 'void',
    name: 'Void',
    colors: {
      void: '#050505',
      void100: '#0a0a0a',
      void200: '#111111',
      void300: '#1a1a1a',
      accent: '#ff3333',
      accentGlow: '#ff4444',
      crtGreen: '#33ff33',
      crtAmber: '#ffaa00',
      crtWhite: '#f0f0f0',
    },
    terminal: {
      background: '#050505',
      foreground: '#f0f0f0',
      cursor: '#ff3333',
      cursorAccent: '#050505',
      selection: 'rgba(255, 51, 51, 0.3)',
      black: '#1a1a1a',
      red: '#ff3333',
      green: '#33ff33',
      yellow: '#ffaa00',
      blue: '#6699ff',
      magenta: '#ff66ff',
      cyan: '#66ffff',
      white: '#f0f0f0',
      brightBlack: '#4a4a4a',
      brightRed: '#ff6666',
      brightGreen: '#66ff66',
      brightYellow: '#ffcc66',
      brightBlue: '#99bbff',
      brightMagenta: '#ff99ff',
      brightCyan: '#99ffff',
      brightWhite: '#ffffff',
    },
  },
  {
    id: 'hacker',
    name: 'Hacker',
    colors: {
      void: '#0a0f0a',
      void100: '#0d140d',
      void200: '#121c12',
      void300: '#1a2a1a',
      accent: '#00ff41',
      accentGlow: '#33ff66',
      crtGreen: '#00ff41',
      crtAmber: '#66ff66',
      crtWhite: '#c0ffc0',
    },
    terminal: {
      background: '#0a0f0a',
      foreground: '#00ff41',
      cursor: '#00ff41',
      cursorAccent: '#0a0f0a',
      selection: 'rgba(0, 255, 65, 0.3)',
      black: '#1a2a1a',
      red: '#ff6b6b',
      green: '#00ff41',
      yellow: '#ffeb3b',
      blue: '#4fc3f7',
      magenta: '#ce93d8',
      cyan: '#4dd0e1',
      white: '#c0ffc0',
      brightBlack: '#3a4a3a',
      brightRed: '#ff8a8a',
      brightGreen: '#66ff77',
      brightYellow: '#fff176',
      brightBlue: '#81d4fa',
      brightMagenta: '#e1bee7',
      brightCyan: '#80deea',
      brightWhite: '#e0ffe0',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    colors: {
      void: '#0f0a05',
      void100: '#140d08',
      void200: '#1c1410',
      void300: '#2a1f14',
      accent: '#ffaa00',
      accentGlow: '#ffcc33',
      crtGreen: '#66ff66',
      crtAmber: '#ffaa00',
      crtWhite: '#ffe0c0',
    },
    terminal: {
      background: '#0f0a05',
      foreground: '#ffaa00',
      cursor: '#ffaa00',
      cursorAccent: '#0f0a05',
      selection: 'rgba(255, 170, 0, 0.3)',
      black: '#2a1f14',
      red: '#ff6b6b',
      green: '#7cfc00',
      yellow: '#ffaa00',
      blue: '#87ceeb',
      magenta: '#dda0dd',
      cyan: '#48d1cc',
      white: '#ffe0c0',
      brightBlack: '#4a3f34',
      brightRed: '#ff8a8a',
      brightGreen: '#98fb98',
      brightYellow: '#ffcc66',
      brightBlue: '#add8e6',
      brightMagenta: '#ee82ee',
      brightCyan: '#66cdaa',
      brightWhite: '#fff5e6',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: {
      void: '#0a0a14',
      void100: '#0d0d1a',
      void200: '#121220',
      void300: '#1a1a2e',
      accent: '#00ffff',
      accentGlow: '#66ffff',
      crtGreen: '#66ff66',
      crtAmber: '#ffcc00',
      crtWhite: '#e0e0ff',
    },
    terminal: {
      background: '#0a0a14',
      foreground: '#e0e0ff',
      cursor: '#00ffff',
      cursorAccent: '#0a0a14',
      selection: 'rgba(0, 255, 255, 0.3)',
      black: '#1a1a2e',
      red: '#ff6b6b',
      green: '#69f0ae',
      yellow: '#ffd54f',
      blue: '#40c4ff',
      magenta: '#e040fb',
      cyan: '#00ffff',
      white: '#e0e0ff',
      brightBlack: '#3a3a4e',
      brightRed: '#ff8a8a',
      brightGreen: '#b9f6ca',
      brightYellow: '#ffe082',
      brightBlue: '#80d8ff',
      brightMagenta: '#ea80fc',
      brightCyan: '#84ffff',
      brightWhite: '#f5f5ff',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    colors: {
      void: '#002b36',
      void100: '#073642',
      void200: '#094753',
      void300: '#0b5864',
      accent: '#268bd2',
      accentGlow: '#4ca3df',
      crtGreen: '#859900',
      crtAmber: '#b58900',
      crtWhite: '#93a1a1',
    },
    terminal: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#268bd2',
      cursorAccent: '#002b36',
      selection: 'rgba(38, 139, 210, 0.3)',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#859900',
      brightYellow: '#b58900',
      brightBlue: '#268bd2',
      brightMagenta: '#6c71c4',
      brightCyan: '#2aa198',
      brightWhite: '#fdf6e3',
    },
  },
];

export const getThemeById = (id: string): Theme => {
  return themes.find((t) => t.id === id) || themes[0];
};
