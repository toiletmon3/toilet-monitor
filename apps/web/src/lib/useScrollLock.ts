import { useEffect } from 'react';

/**
 * Locks page scrolling for kiosk screens (wall tablets must never bounce or
 * pan). Everything else in the app scrolls normally — see the scroll-policy
 * comment in index.css. Call this once at the top of every kiosk route.
 */
export function useScrollLock() {
  useEffect(() => {
    document.documentElement.classList.add('scroll-lock');
    return () => document.documentElement.classList.remove('scroll-lock');
  }, []);
}
