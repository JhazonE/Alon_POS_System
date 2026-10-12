/**
 * Read the signed-in user's uid from the `mock-user-session` entry that
 * /api/auth/login's response is stored under.
 *
 * Returns '' when there is no session, when localStorage is unavailable
 * (SSR, private windows, blocked site data), or when the stored JSON is
 * malformed. It never fabricates a uid: the server rejects a missing one,
 * so an absent session surfaces as an honest 403 rather than a wrong scope.
 */
export function getSessionUid(): string {
  try {
    const raw = localStorage.getItem('mock-user-session');
    const uid = raw ? JSON.parse(raw)?.uid : '';
    return typeof uid === 'string' ? uid : '';
  } catch {
    return '';
  }
}

/** Append the session uid to a request's query params, if there is one. */
export function appendSessionUid(params: URLSearchParams): void {
  const uid = getSessionUid();
  if (uid) params.append('uid', uid);
}
