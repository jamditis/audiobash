# UI/UX Aesthetic Rules

## Design Philosophy

### Void/Brutalist Principles
- **Minimal decoration** - Function over ornament
- **Brutal honesty** - No skeuomorphism, embrace digital nature
- **Deep blacks** - True void, not gray
- **High contrast** - Maximum readability
- **Retrotechnofuturism** - CRT terminals meet modern AI

### Core Values
1. **Clarity** - Every element serves a purpose
2. **Speed** - Instant feedback, no animations unless functional
3. **Power** - Expose functionality, don't hide it
4. **Authenticity** - Embrace the terminal aesthetic

## Color Palette

### Primary Colors
```css
--void: #050505;      /* Deep black backgrounds */
--chrome: #e5e5e5;    /* Light gray text */
--acid: #ccff00;      /* Neon yellow accent */
```

### Semantic Colors
```css
--accent-red: #ff3333;    /* Error states, recording indicator */
--crt-green: #33ff33;     /* Success states, active terminals */
--amber: #ffaa00;         /* Warning states, pending actions */
--terminal-bg: #000000;   /* Pure black for terminal */
--terminal-fg: #00ff00;   /* Classic green phosphor text */
```

### Usage Guidelines
- **Void (#050505)** - Primary background, panels, UI chrome
- **Chrome (#e5e5e5)** - Primary text, icons, borders
- **Acid (#ccff00)** - Highlights, hover states, active elements
- **Accent Red (#ff3333)** - Recording indicator, errors, destructive actions
- **CRT Green (#33ff33)** - Terminal output, success states
- **Amber (#ffaa00)** - Warnings, pending states

## Typography

### Font Stack
```css
--font-display: 'Chakra Petch', sans-serif;     /* Headers, UI labels */
--font-body: 'Share Tech Mono', monospace;      /* Body text, terminal */
--font-terminal: 'Fira Code', 'Courier New';    /* Terminal only */
```

### Font Loading
- Include Google Fonts via CDN or local files
- Always specify fallback fonts
- Subset fonts to reduce load time

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
```

### Type Scale
```css
--text-xs: 0.75rem;     /* 12px - Hints, metadata */
--text-sm: 0.875rem;    /* 14px - Secondary text */
--text-base: 1rem;      /* 16px - Body text */
--text-lg: 1.125rem;    /* 18px - Subheadings */
--text-xl: 1.25rem;     /* 20px - Headings */
--text-2xl: 1.5rem;     /* 24px - Major headings */
--text-3xl: 1.875rem;   /* 30px - Display text */
```

### Typography Rules
- **Headers** - Use Chakra Petch, bold weight
- **Body text** - Use Share Tech Mono for consistency
- **Terminal** - Fira Code for ligature support
- **Line height** - 1.5 for readability, 1.2 for terminal
- **Letter spacing** - Slightly wider (0.02em) for mono fonts

## Layout

### Spacing System
```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-12: 3rem;     /* 48px */
```

### Grid System
- Use CSS Grid for major layout sections
- Flexbox for component-level layout
- Avoid deeply nested grids

### Responsive Breakpoints
```css
--screen-sm: 640px;
--screen-md: 768px;
--screen-lg: 1024px;
--screen-xl: 1280px;
```

## Visual Effects

### CRT Scan Line Overlay
```css
.crt-effect::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    transparent 1px,
    transparent 2px,
    rgba(0, 0, 0, 0.15) 3px
  );
  pointer-events: none;
  z-index: 1000;
}
```

### Glow Effects
```css
.terminal-glow {
  text-shadow: 0 0 5px currentColor,
               0 0 10px currentColor;
}

.accent-glow {
  box-shadow: 0 0 10px var(--acid),
              0 0 20px var(--acid),
              inset 0 0 10px var(--acid);
}
```

### Transitions
- **Instant** (0ms) - Terminal output, text selection
- **Fast** (100ms) - Hover states, button clicks
- **Normal** (200ms) - Panel slides, tab switches
- **Slow** (300ms) - Modal overlays, major state changes

```css
/* ✅ CORRECT - Functional transitions */
.button {
  transition: background-color 100ms ease;
}

/* ❌ WRONG - Gratuitous animation */
.button {
  transition: all 500ms cubic-bezier(.17,.67,.83,.67);
  animation: pulse 2s infinite;
}
```

## Component Patterns

### Buttons
```tsx
// Primary action button
<button className="
  bg-void
  border-2 border-chrome
  text-chrome
  px-4 py-2
  font-['Chakra_Petch']
  hover:bg-chrome hover:text-void
  active:border-acid
  transition-colors duration-100
">
  Action
</button>

// Danger button
<button className="
  bg-void
  border-2 border-accent-red
  text-accent-red
  hover:bg-accent-red hover:text-void
">
  Delete
</button>
```

### Input Fields
```tsx
<input className="
  bg-void
  border-2 border-chrome
  text-chrome
  px-3 py-2
  font-['Share_Tech_Mono']
  focus:border-acid focus:outline-none
  placeholder:text-chrome/50
" />
```

### Panels
```tsx
<div className="
  bg-void
  border border-chrome
  p-6
  shadow-lg
">
  {/* Panel content */}
</div>
```

## Terminal Styling

### xterm.js Theme
```typescript
const terminalTheme = {
  background: '#000000',
  foreground: '#00ff00',
  cursor: '#ccff00',
  cursorAccent: '#050505',
  selection: 'rgba(204, 255, 0, 0.3)',
  black: '#000000',
  red: '#ff3333',
  green: '#33ff33',
  yellow: '#ccff00',
  blue: '#3333ff',
  magenta: '#ff33ff',
  cyan: '#33ffff',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#ff6666',
  brightGreen: '#66ff66',
  brightYellow: '#ffff66',
  brightBlue: '#6666ff',
  brightMagenta: '#ff66ff',
  brightCyan: '#66ffff',
  brightWhite: '#ffffff'
};
```

### Terminal Font
- Font family: Fira Code, Consolas, monospace
- Font size: 14px
- Line height: 1.2
- Letter spacing: 0
- Enable ligatures for Fira Code

## Icons

### Icon Style
- **Line icons** - Outlined, not filled
- **Stroke width** - 2px for consistency
- **Size** - 16px (small), 24px (medium), 32px (large)
- **Color** - Match text color (chrome/acid)

### Icon Libraries
- Prefer Lucide React for consistency
- Avoid mixing icon libraries
- Use inline SVGs for custom icons

```tsx
import { Mic, MicOff, Settings } from 'lucide-react';

<Mic
  size={24}
  color="#e5e5e5"
  strokeWidth={2}
/>
```

## Accessibility

### Contrast Ratios
- Text: Minimum 7:1 (AAA standard)
- UI components: Minimum 4.5:1
- Test with axe DevTools

### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Visible focus indicators (acid border)
- Logical tab order

```css
*:focus-visible {
  outline: 2px solid var(--acid);
  outline-offset: 2px;
}
```

### Screen Reader Support
- Use semantic HTML
- Provide ARIA labels for icon buttons
- Test with screen readers

```tsx
<button aria-label="Start recording">
  <Mic />
</button>
```

## Animation Principles

### Purposeful Motion
- Animations must communicate state changes
- No decorative animations
- Respect `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Loading States
```tsx
// Recording indicator pulse
<div className="
  w-3 h-3
  bg-accent-red
  rounded-full
  animate-pulse
" />
```

## Tailwind CSS Configuration

### Custom Tailwind Config
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        void: '#050505',
        chrome: '#e5e5e5',
        acid: '#ccff00',
        'accent-red': '#ff3333',
        'crt-green': '#33ff33',
        amber: '#ffaa00'
      },
      fontFamily: {
        display: ['Chakra Petch', 'sans-serif'],
        body: ['Share Tech Mono', 'monospace'],
        terminal: ['Fira Code', 'Courier New', 'monospace']
      }
    }
  }
};
```

## Documentation Style

### GitHub Pages Aesthetic
- Match app aesthetic exactly
- Use same color palette and fonts
- Include CRT scan line overlay
- Mobile-responsive design

### Screenshot Guidelines
- Full resolution PNGs in `docs/screenshots/`
- Web-optimized versions (800px max width) with `-web` suffix
- Capture actual app UI, no mockups
- Show real usage scenarios

## Anti-Patterns

### Avoid
- ❌ Rounded corners (too soft for brutalist aesthetic)
- ❌ Gradients (use solid colors)
- ❌ Drop shadows (except for glow effects)
- ❌ Excessive whitespace (compact is powerful)
- ❌ Pastel colors (high contrast only)
- ❌ Decorative animations
- ❌ Skeuomorphic effects (texture overlays, faux materials)

### Embrace
- ✅ Sharp edges and corners
- ✅ Flat, solid colors
- ✅ Dense information display
- ✅ Functional indicators (recording dot, status badges)
- ✅ Terminal-inspired UI
- ✅ Instant feedback
- ✅ Raw, unpolished authenticity
