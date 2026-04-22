/**
 * Web Push subscription utilities.
 * The VAPID public key is safe to embed in client code.
 */

const VAPID_PUBLIC_KEY = 'BJ5sC-Xbm4p2tZ3uxkeQqgTDL4kCGvlu8MocKQ9TtbzB-FJBF8rPxkkNPhvSqniHlCTEVWNfwA1fMtO9pAr-C5Q';
const PUSH_APPROVED_KEY = 'push-approved';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}

/** True if the user has approved push at least once on this device. */
export function wasPushApproved(): boolean {
  return localStorage.getItem(PUSH_APPROVED_KEY) === '1';
}

/**
 * Request notification permission, register push subscription,
 * and send it to the server linked to this user.
 *
 * Safe to call multiple times — re-uses existing subscription if present.
 */
export async function registerPush(userId: string, orgId: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, orgId, subscription: sub.toJSON() }),
    });

    localStorage.setItem(PUSH_APPROVED_KEY, '1');
  } catch (err) {
    console.warn('[push] registration failed:', err);
  }
}

/**
 * Remove server-side subscription on logout.
 * Keeps the browser push subscription alive so re-login doesn't
 * need a new permission prompt.
 */
export async function unregisterPush(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch (err) {
    console.warn('[push] unregister failed:', err);
  }
}
