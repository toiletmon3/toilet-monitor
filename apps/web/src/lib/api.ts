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

// ── Offline read-through cache for the public kiosk GETs ──────────────────────
// The kiosk loads its device, buttons, issue-types and staff roster fresh on
// every page load. With no internet those GETs reject and the kiosk renders
// empty (no buttons) and the team screen can't identify anyone. Cache the last
// successful response per URL and replay it on a network error, so a tablet that
// has been online at least once keeps working through an outage.
const OFFLINE_CACHE_PREFIX = 'apiCache:';
const OFFLINE_CACHEABLE = [
  /^\/auth\/kiosk\//,
  /^\/auth\/default-org/,
  /^\/buildings\/issue-types\//,
  /^\/buildings\/kiosk-buttons\//,
  /^\/buildings\/kiosk-config\//,
  /^\/buildings\/public-structure\//,
  /^\/users\/kiosk-roster\//,
  /^\/analytics\/kiosk-stats\//,
];

function offlineCacheKey(config: any): string {
  return OFFLINE_CACHE_PREFIX + (config?.method || 'get').toLowerCase() + ':' + (config?.url || '');
}
function isOfflineCacheable(config: any): boolean {
  const method = (config?.method || 'get').toLowerCase();
  return method === 'get' && OFFLINE_CACHEABLE.some((re) => re.test(config?.url || ''));
}
function isNetworkErr(err: any): boolean {
  return !err?.response || err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED';
}

api.interceptors.response.use(
  (res) => {
    if (isOfflineCacheable(res.config)) {
      try { localStorage.setItem(offlineCacheKey(res.config), JSON.stringify(res.data)); } catch { /* storage full/disabled */ }
    }
    return res;
  },
  (err) => {
    const config = err?.config;
    if (config && isNetworkErr(err) && isOfflineCacheable(config)) {
      try {
        const cached = localStorage.getItem(offlineCacheKey(config));
        if (cached != null) {
          return Promise.resolve({
            data: JSON.parse(cached),
            status: 200,
            statusText: 'OK (offline cache)',
            headers: {},
            config,
            request: err.request,
          });
        }
      } catch { /* fall through to reject */ }
    }
    return Promise.reject(err);
  },
);

export default api;
