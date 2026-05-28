/**
 * pushNotifications.js — Zynk
 * 
 * Handles requesting permission, subscribing to Web Push via the service worker,
 * saving the subscription to the Zynk backend, and listening for notification clicks.
 */
import { API_BASE } from './constants';

/**
 * Convert a base64url VAPID public key to a Uint8Array (required by the browser push API)
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

/**
 * Subscribe to Web Push notifications.
 * Call this after the user logs in (and has granted notification permission).
 * @param {string} authToken - the user's JWT token
 * @returns {Promise<PushSubscription|null>}
 */
export async function subscribeToPush(authToken) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('[Push] Browser does not support push notifications');
      return null;
    }

    // Ask for permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied');
      return null;
    }

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from server
    const keyRes = await fetch(`${API_BASE}/push/vapid-public-key`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!keyRes.ok) throw new Error('Failed to fetch VAPID public key');
    const { publicKey } = await keyRes.json();

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    // Send subscription to our backend
    await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(subscription)
    });

    console.log('[Push] Successfully subscribed to push notifications');

    // Listen for messages from service worker (notification clicks)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICK') {
        // Dispatch a custom event so React components can react
        window.dispatchEvent(new CustomEvent('zynk:notification-click', { detail: event.data.data }));
      }
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        // Re-save the new subscription
        const newSub = event.data.subscription;
        if (newSub && authToken) {
          fetch(`${API_BASE}/push/subscribe`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify(newSub)
          }).catch(console.error);
        }
      }
    });

    return subscription;
  } catch (err) {
    console.error('[Push] Subscription error:', err);
    return null;
  }
}

/**
 * Unsubscribe from push notifications and remove from server.
 * @param {string} authToken
 */
export async function unsubscribeFromPush(authToken) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Remove from server
    await fetch(`${API_BASE}/push/unsubscribe`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });

    // Unsubscribe locally
    await subscription.unsubscribe();
    console.log('[Push] Unsubscribed from push notifications');
  } catch (err) {
    console.error('[Push] Unsubscribe error:', err);
  }
}
