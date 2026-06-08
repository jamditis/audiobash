import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export interface ConsoleError {
  id: string;
  type: 'error' | 'warn';
  message: string;
  stack?: string;
  timestamp: Date;
}

interface ConsoleErrorContextType {
  errors: ConsoleError[];
  hasUnreadErrors: boolean;
  addError: (error: Omit<ConsoleError, 'id' | 'timestamp'>) => void;
  clearErrors: () => void;
  markAsRead: () => void;
}

const ConsoleErrorContext = createContext<ConsoleErrorContextType | null>(null);

export const useConsoleErrors = () => {
  const context = useContext(ConsoleErrorContext);
  if (!context) {
    throw new Error('useConsoleErrors must be used within a ConsoleErrorProvider');
  }
  return context;
};

export const ConsoleErrorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [errors, setErrors] = useState<ConsoleError[]>([]);
  const [hasUnreadErrors, setHasUnreadErrors] = useState(false);

  const addError = useCallback((error: Omit<ConsoleError, 'id' | 'timestamp'>) => {
    const newError: ConsoleError = {
      ...error,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    setErrors((prev) => [...prev.slice(-99), newError]); // Keep last 100 errors
    setHasUnreadErrors(true);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setHasUnreadErrors(false);
  }, []);

  const markAsRead = useCallback(() => {
    setHasUnreadErrors(false);
  }, []);

  // Intercept console.error and console.warn
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: unknown[]) => {
      // Call original
      originalError.apply(console, args);

      // Capture error
      const message = args
        .map((arg) => {
          if (arg instanceof Error) {
            return arg.message;
          }
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      const stack = args.find((arg) => arg instanceof Error)?.stack;

      addError({
        type: 'error',
        message,
        stack: stack as string | undefined,
      });
    };

    console.warn = (...args: unknown[]) => {
      // Call original
      originalWarn.apply(console, args);

      // Capture warning (but don't set hasUnreadErrors for warnings)
      const message = args
        .map((arg) => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        })
        .join(' ');

      addError({
        type: 'warn',
        message,
      });
    };

    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      addError({
        type: 'error',
        message: event.message,
        stack: event.error?.stack,
      });
    };

    // Handle unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      addError({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [addError]);

  return (
    <ConsoleErrorContext.Provider
      value={{ errors, hasUnreadErrors, addError, clearErrors, markAsRead }}
    >
      {children}
    </ConsoleErrorContext.Provider>
  );
};
