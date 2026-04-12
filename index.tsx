
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const LEGACY_CACHE_PREFIXES = ['kuci-shell-'];

async function clearLegacyBrowserCaches(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  try {
    const cacheKeys = await window.caches.keys();
    await Promise.all(
      cacheKeys
        .filter((key) => LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => window.caches.delete(key))
    );
  } catch (error) {
    console.warn('Cache cleanup failed:', error);
  }
}

async function unregisterLegacyServiceWorkers(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn('Service worker cleanup failed:', error);
  }
}

void unregisterLegacyServiceWorkers();
void clearLegacyBrowserCaches();

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
