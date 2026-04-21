/**
 * Web Push subscription utilities.
 * The VAPID public key is safe to embed in client code.
 */

const VAPID_PUBLIC_KEY = 'BJ5sC-Xbm4p2tZ3uxkeQqgTDL4kCGvlu8MocKQ9TtbzB-FJBF8rPxkkNPhvSqniHlCTEVWNfwA1fMtO9pAr-C5Q';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
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

    // Ask for permission (no-op if already granted/denied)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;

    // Re-use existing subscription or create a new one
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Register with our backend
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, orgId, subscription: sub.toJSON() }),
    });
  } catch (err) {
    // Push is non-critical — never block the UI
    console.warn('[push] registration failed:', err);
  }
}

/** Unsubscribe from push (call on logout) */
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
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[push] unregister failed:', err);
  }
}
