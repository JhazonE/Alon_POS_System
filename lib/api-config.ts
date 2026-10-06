/**
 * Centralized API configuration
 */
/**
 * Centralized API configuration
 */
export const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api';
export const API_BASE_URL = DEFAULT_API_BASE_URL;

/**
 * Normalizes and formats an API base URL and path
 * @param base - The base IP or URL (e.g., '192.168.1.100' or 'http://localhost:3001')
 * @param path - The endpoint path (e.g., '/products')
 * @returns The full formatted URL
 */
export const formatApiUrl = (base: string, path: string) => {
  let formatted = base.trim();
  
  if (!formatted) return path.startsWith('/') ? `/api${path}` : `/api/${path}`;

  // Add protocol if missing
  if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
    formatted = `http://${formatted}`;
  }
  
  // Robust port 3001 appending for IP addresses and localhost
  // We check if it contains a colon (after the protocol) to see if a port is already there
  const urlParts = formatted.split('://');
  if (urlParts.length > 1) {
    const authority = urlParts[1].split('/')[0];
    // If authority doesn't have a port and it's an IP or localhost or doesn't have a domain suffix
    if (!authority.includes(':')) {
      const isIP = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(authority);
      const isLocalhost = authority === 'localhost';
      const noDomainSuffix = !authority.includes('.');
      
      if (isIP || isLocalhost || noDomainSuffix) {
        formatted = formatted.replace(authority, `${authority}:3000`);
      }
    }
  }
  
  // Ensure it ends with /api
  if (!formatted.endsWith('/api') && !formatted.includes('/api/')) {
    formatted = `${formatted.replace(/\/$/, '')}/api`;
  }
  
  const cleanBase = formatted.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};

/**
 * Helper to get the full API URL for a specific endpoint
 * @param path - The endpoint path (e.g., '/products')
 * @returns The full URL or relative path
 */
export const getApiUrl = (path: string) => {
  // In browser context, handle custom server IP and fallback to relative paths
  if (typeof window !== 'undefined') {
    const customIp = localStorage.getItem('server_ip');
    
    if (customIp) {
      return formatApiUrl(customIp, path);
    }
    
    // Check if we are running in a file:// environment (like Electron production)
    const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

    if (isFileProtocol) {
      // In file:// context, relative paths (/api/...) resolve to file:///api/... which fails.
      // We must use the absolute default API URL.
      return formatApiUrl(DEFAULT_API_BASE_URL, path);
    }
    
    // FALLBACK: Use relative path in the browser if no custom IP is set and we're on http/https.
    // This ensures compatibility with whatever port the dev server is running on (e.g. 3000 vs 3001).
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `/api${cleanPath}`;
  }

  // Server-side context (SSR/Server Actions)
  const cleanBase = DEFAULT_API_BASE_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
};

const TOKEN_STORAGE_KEY = 'alon-session-token';
const SESSION_STORAGE_KEY = 'mock-user-session';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* private mode / blocked storage — the next request 401s and re-logs in */
  }
}

export function clearStoredSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * fetch for OUR API: attaches the session token and handles 401 centrally.
 *
 * Use this for every call to this app's /api routes. Do NOT use it for
 * outbound third-party calls (the Sta. Lucia mall consolidator in
 * lib/integrations/sta-lucia/, the license server) — those share the /api/
 * path shape but belong to other systems, and sending them our token would
 * leak a credential. Also do NOT use it for the public pre-token routes
 * (/api/auth/login, /api/license/*): a failed login is a 401, and authFetch
 * would turn "invalid credentials" into a redirect to /login.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();

  const headers = new Headers(init.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, { ...init, headers });

  // 401 means the token is absent, tampered with, or expired (a 12h TTL means
  // a shift that starts before midnight can cross it). Clear and send the user
  // to login.
  if (response.status === 401 && typeof window !== 'undefined') {
    clearStoredSession();

    // /pos renders its own login overlay (app/(app)/pos/page.tsx) and fires
    // settings/terminal fetches on mount, before a cashier has signed in.
    // Redirecting here would navigate away from the only screen that can log
    // a POS terminal in, so a cold terminal could never start. The overlay is
    // already showing; let it collect credentials and write a fresh token.
    const onPos = window.location.pathname === '/pos'
      || window.location.pathname.startsWith('/pos/');

    if (!onPos && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  // 403 is NOT a logout: the caller is authenticated and merely lacks a
  // permission. Logging a cashier out here would lose an in-progress sale.
  // Surface it and let the caller carry on handling the response.
  if (response.status === 403 && typeof window !== 'undefined') {
    // Loaded lazily: use-toast is a client-only React module, and this file is
    // also imported by server-side code (lib/external-api-config.ts and
    // friends), which must not pull React in at import time.
    import('@/hooks/use-toast')
      .then(({ toast }) =>
        toast({
          variant: 'destructive',
          title: 'Not permitted',
          description: "You don't have permission to do that.",
        })
      )
      .catch(() => {
        /* a toast failing to render must never break the caller */
      });
  }

  return response;
}
