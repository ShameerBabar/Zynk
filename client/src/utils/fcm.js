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
    
    // Request token using the custom service worker registration
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: FCM_VAPID_KEY || undefined
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
      
      // Save token locally for debug/diagnostics UI
      localStorage.setItem('zynk_fcm_token', token);
      return token;
    } else {
      console.warn('[FCM] No registration token available.');
      return null;
    }
  } catch (err) {
    console.error('[FCM] Registration failed:', err);
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
