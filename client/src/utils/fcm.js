import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { API_BASE } from './constants';

const firebaseConfig = {
  apiKey: "AIzaSyDiRo7AxZMtKM4_q4Z1LI__UgXdWOcXYSk",
  authDomain: "zynk-chat-shameer-2026.firebaseapp.com",
  projectId: "zynk-chat-shameer-2026",
  storageBucket: "zynk-chat-shameer-2026.firebasestorage.app",
  messagingSenderId: "453406012303",
  appId: "1:453406012303:web:30f6eb1d5f80271bfa91fa"
};

// Initialize Firebase App
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

let messaging = null;
try {
  // Check if Web Push/Messaging is supported in this browser
  if (typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
    messaging = getMessaging(app);
  }
} catch (err) {
  console.warn('[FCM] Firebase messaging is not supported in this browser:', err.message);
}

// VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
const FCM_VAPID_KEY = import.meta.env.VITE_FCM_VAPID_KEY || 'BLCG3IUXgSpeZUO3yD38_Wz7zr6FrxbksxcJ4dOhPehSKS5Y1Tt-q6uCiTd_zL3w_2k9YMoe9x_HicMvm66FZqA';

/**
 * Check if the browser supports push notifications/FCM
 */
export function isPushSupported() {
  return messaging !== null;
}

/**
 * Register FCM push token for the current authenticated user.
 */
export async function registerFCM(authToken) {
  if (!messaging) {
    console.warn('[FCM] Push notifications are not supported on this device/browser.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied by user.');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;

    // Clear any stale push subscription from a previous/different VAPID key.
    // Without this, getToken() silently fails when the old subscription
    // was created with a different key (e.g. the old placeholder key).
    try {
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
        console.log('[FCM] Cleared stale push subscription before re-registering.');
      }
    } catch (subErr) {
      console.warn('[FCM] Could not clear old subscription:', subErr.message);
    }
    
    // Request a fresh FCM token with the correct VAPID key
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: FCM_VAPID_KEY
    });

    if (token) {
      console.log('[FCM] Successfully generated Registration Token:', token);
      
      // Upload token to backend
      const res = await fetch(`${API_BASE}/push/subscribe-fcm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token, deviceType: 'web' })
      });

      if (!res.ok) {
        throw new Error('Failed to save FCM token on server');
      }

      console.log('[FCM] Successfully registered token on backend');
      localStorage.setItem('zynk_fcm_token', token);
      // Notify the rest of the app (e.g. the bell icon) that push is now active
      window.dispatchEvent(new CustomEvent('zynk:push-state-changed', { detail: { active: true } }));
      return token;
    } else {
      console.warn('[FCM] No registration token available.');
      window.dispatchEvent(new CustomEvent('zynk:push-state-changed', { detail: { active: false } }));
      return null;
    }
  } catch (err) {
    console.error('[FCM] Registration failed:', err);
    window.dispatchEvent(new CustomEvent('zynk:push-state-changed', { detail: { active: false } }));
    return null;
  }
}

/**
 * Unregister FCM token on logout.
 */
export async function unregisterFCM(authToken) {
  if (!messaging) return;

  try {
    const token = localStorage.getItem('zynk_fcm_token');
    if (token) {
      // Remove from backend
      await fetch(`${API_BASE}/push/unsubscribe-fcm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ token })
      });
      console.log('[FCM] Unregistered token from backend');
    }
    localStorage.removeItem('zynk_fcm_token');
    // Notify the rest of the app that push is now inactive
    window.dispatchEvent(new CustomEvent('zynk:push-state-changed', { detail: { active: false } }));
  } catch (err) {
    console.error('[FCM] Unregistration error:', err);
  }
}

/**
 * Listen for foreground FCM messages.
 */
export function onForegroundMessage(callback) {
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    console.log('[FCM] Foreground message received:', payload);
    callback(payload);
  });
}
