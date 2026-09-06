import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (Capacitor.isNativePlatform() && !apiBaseUrl) {
  throw new Error('VITE_API_BASE_URL is required in native MacroCount builds.');
}

if (apiBaseUrl) {
  setBaseUrl(apiBaseUrl);
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
