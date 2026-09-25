/** Add safe request context to browser transport failures, without logging
 * credentials, request bodies, query strings or resource identifiers. */
export const browserFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;

    const request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    const rawUrl = request ? request.url : String(input);
    let endpoint = 'Supabase';
    try {
      const url = new URL(rawUrl);
      const authEndpoint = /^\/auth\/v1\/(user|token|logout|signup|recover|verify)$/.test(url.pathname);
      // Keep auth operation names; redact arbitrary storage paths and IDs.
      const path = authEndpoint ? url.pathname : `/${url.pathname.split('/').filter(Boolean).slice(0, 2).join('/')}/…`;
      endpoint = `${url.origin}${path}`;
    } catch { /* Never echo an unparseable URL, which may contain secrets. */ }
    const method = init?.method ?? request?.method ?? 'GET';
    const connection = typeof navigator === 'undefined' ? 'unknown' : navigator.onLine ? 'online' : 'offline';
    throw new TypeError(
      `Failed to fetch Supabase: ${method} ${endpoint} (browser reports ${connection}). Check this request in the Network panel.`,
      { cause: error },
    );
  }
};
