/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Void aesthetic - deep blacks and grays
        void: {
          DEFAULT: '#050505',
          100: '#0a0a0a',
          200: '#111111',
          300: '#1a1a1a',
          400: '#242424',
        },
        // Brutalist accent - harsh, functional
        accent: {
          DEFAULT: '#ff3333',
          muted: '#cc2828',
          glow: '#ff4444',
        },
        // Retro CRT tones
        crt: {
          green: '#33ff33',
          amber: '#ffaa00',
          white: '#f0f0f0',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Berkeley Mono', 'Consolas', 'monospace'],
        display: ['Space Grotesk', 'Arial Black', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
    },
  },
  plugins: [],
}
