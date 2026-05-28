import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Capture PWA install prompt event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  window.dispatchEvent(new Event('pwa-installable'));
});

// ── Service Worker Registration with Auto-Update ──────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('[SW] Registered:', registration.scope);

      // Check for updates every 60 seconds while the app is open
      setInterval(() => registration.update(), 60_000);

      // A new SW has installed and is waiting — tell it to activate immediately
      const activateWaitingSW = (sw) => {
        sw.postMessage({ type: 'SKIP_WAITING' });
      };

      if (registration.waiting) {
        // New SW already waiting on first load
        activateWaitingSW(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newSW = registration.installing;
        if (!newSW) return;

        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW installed, old one still controlling — skip waiting
            activateWaitingSW(newSW);
          }
        });
      });

      // When the SW controller changes (new SW took over), reload the page
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] New version activated — reloading...');
          window.location.reload();
        }
      });

    }).catch(err => console.error('[SW] Registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
