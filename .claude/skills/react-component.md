---
name: react-component
description: Create React components following AudioBash's void/brutalist aesthetic with Tailwind CSS, TypeScript types, and error handling
context: standard
---

# React Component Generator

You are a React developer building AudioBash UI components. Generate production-ready components that perfectly match the void/brutalist aesthetic and follow established patterns.

## Your Expertise

You understand AudioBash's React patterns:
- **Functional components** with TypeScript and proper typing
- **Hooks best practices**: `useCallback` for event handlers, `useMemo` for expensive computations
- **Tailwind CSS** with AudioBash's custom color tokens and utility classes
- **Props interfaces** exported for reusability
- **Inline SVG icons** (no icon libraries like FontAwesome or Material Icons)
- **Error boundaries** and loading states for all async operations
- **Accessibility** with ARIA labels and keyboard navigation

## Color System

AudioBash uses a void/brutalist palette inspired by retrotechnofuturism:

```typescript
// Backgrounds (darkest to lightest)
'bg-void-100'   // #0a0a0a - deepest black, main backgrounds
'bg-void-200'   // #111111 - component backgrounds, panels
'bg-void-300'   // #1a1a1a - interactive elements, hover states

// Text
'text-crt-white'      // #f0f0f0 - primary text, headings
'text-crt-white/70'   // 70% opacity - secondary text
'text-crt-white/50'   // 50% opacity - labels, placeholders
'text-crt-white/30'   // 30% opacity - tertiary, disabled

// Accent Colors
'text-accent'         // #ff3333 - CRT red (errors, recording, danger)
'text-crt-green'      // #33ff33 - Matrix green (success, active states)
'text-crt-amber'      // #ffaa00 - Amber (warnings, processing, queued)
'text-crt-blue'       // #00ccff - Neon blue (info, links)

// Borders
'border-void-300'           // Default borders
'border-accent/50'          // Focused/active state
'hover:border-crt-white/20' // Hover state
'border-crt-green/30'       // Success state

// Effects
'shadow-lg shadow-accent/20'     // Glow effect
'backdrop-blur-sm'               // Frosted glass effect
'transition-colors duration-200' // Smooth color transitions
```

## Typography

```typescript
// Font families (already configured in Tailwind)
'font-mono'    // Share Tech Mono - body text, inputs, code
'font-display' // Chakra Petch - headings, titles

// Font sizes
'text-[10px]'  // Labels, captions
'text-xs'      // 12px - small UI text
'text-sm'      // 14px - body text
'text-base'    // 16px - default
'text-lg'      // 18px - section headings
'text-xl'      // 20px - page titles

// Font weights & styles
'uppercase'          // All-caps labels
'tracking-wide'      // Letter spacing for labels
'tracking-wider'     // More spacing for buttons
```

## Component Template

```tsx
import React, { useState, useCallback, useMemo } from 'react';

interface ComponentNameProps {
  /** Required prop with description */
  requiredProp: string;
  /** Optional callback */
  onAction?: (value: string) => void;
  /** Optional with default value */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Optional styling class */
  className?: string;
}

/**
 * ComponentName - Brief description of what it does
 *
 * @example
 * <ComponentName
 *   requiredProp="value"
 *   onAction={(val) => console.log(val)}
 *   variant="primary"
 * />
 */
export const ComponentName: React.FC<ComponentNameProps> = ({
  requiredProp,
  onAction,
  variant = 'primary',
  className = '',
}) => {
  const [internalState, setInternalState] = useState(false);

  const handleClick = useCallback(() => {
    setInternalState(prev => !prev);
    onAction?.(requiredProp);
  }, [onAction, requiredProp]);

  const computedClass = useMemo(() => {
    const baseClass = 'p-3 rounded border transition-colors';

    const variantClass = {
      primary: 'bg-void-200 border-accent/50 hover:bg-void-300',
      secondary: 'bg-void-300 border-void-300 hover:border-crt-white/20',
      danger: 'bg-accent/10 border-accent/30 hover:bg-accent/20',
    }[variant];

    return `${baseClass} ${variantClass} ${className}`;
  }, [variant, className]);

  return (
    <div className={computedClass}>
      <button
        onClick={handleClick}
        className="text-sm font-mono text-crt-white hover:text-accent transition-colors"
      >
        {requiredProp}
      </button>
    </div>
  );
};
```

## Common Patterns

### Button Component

```tsx
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  disabled = false,
  variant = 'primary',
  size = 'md',
}) => {
  const baseClass = 'rounded font-mono uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  const sizeClass = {
    sm: 'px-2 py-1 text-[10px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2 text-sm',
  }[size];

  const variantClass = {
    primary: 'bg-accent text-void-100 hover:bg-accent/90 active:bg-accent/80',
    secondary: 'bg-void-200 text-crt-white/70 hover:bg-void-300 hover:text-crt-white border border-void-300 hover:border-crt-white/20',
    danger: 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/50',
    ghost: 'bg-transparent text-crt-white/70 hover:text-crt-white hover:bg-void-300',
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClass} ${sizeClass} ${variantClass}`}
    >
      {children}
    </button>
  );
};
```

### Icon Button

```tsx
interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  onClick,
  title,
  active = false,
}) => {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        p-1.5 rounded transition-colors
        ${active
          ? 'bg-accent/20 text-accent'
          : 'text-crt-white/50 hover:text-crt-white hover:bg-void-300'
        }
      `}
    >
      {icon}
    </button>
  );
};

// Usage:
<IconButton
  icon={
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  }
  title="Close"
  onClick={handleClose}
/>
```

### Status Badge

```tsx
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'error' | 'warning';
  label: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const statusConfig = {
    active: {
      bg: 'bg-crt-green/10',
      text: 'text-crt-green',
      dot: 'bg-crt-green',
    },
    inactive: {
      bg: 'bg-void-300',
      text: 'text-crt-white/50',
      dot: 'bg-crt-white/30',
    },
    error: {
      bg: 'bg-accent/10',
      text: 'text-accent',
      dot: 'bg-accent',
    },
    warning: {
      bg: 'bg-crt-amber/10',
      text: 'text-crt-amber',
      dot: 'bg-crt-amber',
    },
  }[status];

  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-0.5 rounded
      text-[10px] font-mono uppercase tracking-wide
      ${statusConfig.bg} ${statusConfig.text}
    `}>
      <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
      {label}
    </span>
  );
};
```

### Input Field

```tsx
interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  error?: string;
  label?: string;
  disabled?: boolean;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder,
  type = 'text',
  error,
  label,
  disabled = false,
}) => {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-[10px] text-crt-white/50 font-mono uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`
          w-full bg-void-200 border rounded px-3 py-2
          text-sm text-crt-white font-mono
          placeholder-crt-white/20
          transition-colors
          focus:outline-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error
            ? 'border-accent/50 focus:border-accent'
            : 'border-void-300 focus:border-accent/50'
          }
        `}
      />
      {error && (
        <p className="text-[9px] text-accent font-mono">
          {error}
        </p>
      )}
    </div>
  );
};
```

### Toggle Switch

```tsx
interface ToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
  description?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  enabled,
  onChange,
  label,
  description,
}) => {
  return (
    <div className="flex items-start gap-3">
      <button
        onClick={() => onChange(!enabled)}
        className={`
          relative w-10 h-5 rounded-full transition-colors shrink-0
          ${enabled ? 'bg-crt-green' : 'bg-void-300'}
        `}
        role="switch"
        aria-checked={enabled}
      >
        <div className={`
          absolute top-0.5 w-4 h-4 rounded-full bg-crt-white
          transition-transform
          ${enabled ? 'translate-x-5' : 'translate-x-0.5'}
        `} />
      </button>

      {(label || description) && (
        <div className="space-y-1">
          {label && (
            <p className="text-sm text-crt-white font-mono">
              {label}
            </p>
          )}
          {description && (
            <p className="text-[9px] text-crt-white/30 font-mono">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
```

### Modal/Overlay

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void-100/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-void-100 border border-void-300 rounded-lg shadow-2xl shadow-accent/10 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-void-300">
          <h2 className="text-lg font-display text-crt-white uppercase tracking-wide">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-void-300 text-crt-white/50 hover:text-crt-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-void-300">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
```

### Loading Spinner

```tsx
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'accent' | 'green' | 'amber';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'accent',
}) => {
  const sizeClass = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }[size];

  const colorClass = {
    accent: 'border-accent',
    green: 'border-crt-green',
    amber: 'border-crt-amber',
  }[color];

  return (
    <div className={`
      ${sizeClass} ${colorClass}
      border-2 border-t-transparent rounded-full
      animate-spin
    `} />
  );
};
```

### Card/Panel

```tsx
interface CardProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  variant?: 'default' | 'highlighted';
}

export const Card: React.FC<CardProps> = ({
  title,
  children,
  actions,
  variant = 'default',
}) => {
  const borderClass = variant === 'highlighted'
    ? 'border-accent/30'
    : 'border-void-300';

  return (
    <div className={`bg-void-200 border ${borderClass} rounded-lg overflow-hidden`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-void-300">
          {title && (
            <h3 className="text-sm font-mono text-crt-white uppercase tracking-wide">
              {title}
            </h3>
          )}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  );
};
```

## Error Handling Pattern

```tsx
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AudioBash] Component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-void-200 border border-accent/30 rounded-lg">
          <svg className="w-12 h-12 text-accent mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-display text-crt-white uppercase mb-2">
            Component Error
          </h3>
          <p className="text-sm text-crt-white/50 font-mono mb-4">
            {this.state.error?.message || 'Something went wrong'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-accent text-void-100 rounded text-xs font-mono uppercase tracking-wider hover:bg-accent/90 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Async Data Loading Pattern

```tsx
interface DataComponentProps {
  id: string;
}

export const DataComponent: React.FC<DataComponentProps> = ({ id }) => {
  const [data, setData] = useState<DataType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await window.electron.fetchData(id);
        if (result.success && result.data) {
          setData(result.data);
        } else {
          throw new Error(result.error || 'Failed to load data');
        }
      } catch (err) {
        console.error('[DataComponent] Load error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" color="accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-accent/10 border border-accent/30 rounded text-accent text-sm font-mono">
        Error: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-crt-white/50 text-sm font-mono">
        No data available
      </div>
    );
  }

  return (
    <div>
      {/* Render data */}
    </div>
  );
};
```

## File Location

All components go in `src/components/ComponentName.tsx`.

## Accessibility

Always include:
- ARIA labels for icon buttons: `aria-label="Close dialog"`
- ARIA roles for custom controls: `role="switch"`, `role="dialog"`
- Keyboard navigation: Support Tab, Enter, Escape
- Focus visible styles: `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`

## Now Generate

Based on the user's component requirements, generate a complete, production-ready component matching AudioBash's void/brutalist aesthetic. Include:
1. Full TypeScript component with proper types
2. Props interface (exported)
3. State management with hooks
4. Event handlers with useCallback
5. Tailwind classes matching the color system
6. Error handling and loading states (if async)
7. Accessibility attributes
8. Usage example in a comment
