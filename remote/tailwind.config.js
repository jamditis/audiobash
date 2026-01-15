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
        // Chrome - light gray text
        chrome: {
          DEFAULT: '#e5e5e5',
        },
        // Acid - neon yellow accent
        acid: {
          DEFAULT: '#ccff00',
        },
        // Accent red - recording, errors
        accent: {
          DEFAULT: '#ff3333',
          muted: '#cc2828',
          glow: '#ff4444',
        },
        // Retro CRT tones
        crt: {
          green: '#33ff33',
          amber: '#ffaa00',
          blue: '#00ccff',
          white: '#f0f0f0',
        }
      },
      fontFamily: {
        display: ['Chakra Petch', 'sans-serif'],
        body: ['Share Tech Mono', 'monospace'],
        mono: ['Share Tech Mono', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 8s linear infinite',
        'recording-pulse': 'recording-pulse 1s ease-in-out infinite',
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
        'recording-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
}
