import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh: concurrent 401s share ONE refresh call. Required now
// that the server ROTATES the refresh token on every refresh — otherwise
// several parallel requests would each present the same (already-rotated)
// token, all but the first would be rejected, and the user would be logged out.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = localStorage.getItem('refreshToken');
  if (!refresh) throw new Error('no refresh token');
  const { data } = await axios.post('/api/auth/refresh', { refreshToken: refresh });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;
    if (err.response?.status === 401 && config && !(config as any)._retry) {
      (config as any)._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newToken = await refreshPromise;
        config.headers.Authorization = `Bearer ${newToken}`;
        return axios(config);
      } catch {
        localStorage.clear();
        // Send the user to the login screen for the interface they're actually
        // in — NOT always the admin login. The old hardcoded '/admin/login'
        // dumped cleaners/supervisors on the MANAGER screen whenever their
        // session expired; in the installed PWA (start_url '/cleaner', separate
        // storage from Safari) that happened on virtually every launch.
        const path = window.location.pathname;
        const loginPath = path.startsWith('/admin')
          ? '/admin/login'
          : path.startsWith('/supervisor')
            ? '/supervisor/login'
            : path.startsWith('/kiosk')
              ? path // kiosk endpoints are public — don't bounce it to a login
              : '/cleaner/login';
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath;
        }
      }
    }
    return Promise.reject(err);
  },
);

export default api;
