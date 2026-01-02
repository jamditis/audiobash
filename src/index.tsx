import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './themes';
import ErrorBoundary from './components/ErrorBoundary';
import { appLog } from './utils/logger';
import './index.css';

// Log app initialization
appLog.info('AudioBash renderer initializing', {
  userAgent: navigator.userAgent,
  url: window.location.href,
});

// Global error handlers for uncaught errors
window.addEventListener('error', (event) => {
  appLog.error('Uncaught error', event.error, {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  appLog.error('Unhandled promise rejection', event.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
