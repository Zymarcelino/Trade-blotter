/**
 * Runtime URL resolution — the SINGLE source of truth for the API base path and
 * the WebSocket URL. No other module reads `import.meta.env.VITE_API_BASE_URL`
 * or `import.meta.env.VITE_WS_URL` directly.
 *
 * Defaults are same-origin so one production build works unchanged for local
 * Docker and hosted deployments (where nginx / the platform proxy `/api` and
 * `/ws` to the backend). The `VITE_*` variables are OPTIONAL dev-only overrides
 * used when the frontend dev server and the backend run on different origins.
 */

/**
 * The API base path. Defaults to the relative same-origin `/api/v1`; a
 * non-empty `VITE_API_BASE_URL` override wins when provided.
 */
export const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL !== ''
    ? import.meta.env.VITE_API_BASE_URL
    : '/api/v1';

/**
 * Resolves the WebSocket URL. Returns a non-empty `VITE_WS_URL` override when
 * set; otherwise derives a same-origin `ws(s)://<host>/ws` from the current
 * page location. Always yields a `ws:`/`wss:` scheme ending in `/ws`.
 */
export function resolveWsUrl(): string {
  const override = import.meta.env.VITE_WS_URL;
  if (override && override !== '') {
    return override;
  }
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws`;
}
