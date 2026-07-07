import { useEffect, useState } from 'react';
import api from './api';

/**
 * The logged-in user's profile. Seeds from the login-time snapshot in
 * localStorage (so the UI renders instantly), then refreshes from the server
 * on mount — so admin-side changes (e.g. building assignment) show up on the
 * next app open without forcing the worker to log out and back in.
 */
export function useCurrentUser() {
  const [user, setUser] = useState<any>(() => JSON.parse(localStorage.getItem('user') ?? '{}'));

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) return;
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser((prev: any) => {
          const merged = { ...prev, ...data };
          localStorage.setItem('user', JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {}); // offline / expired token — keep the snapshot
  }, []);

  return user;
}
