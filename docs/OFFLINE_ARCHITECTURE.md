# TRADETRACK — Offline Architecture

## Overview

TRADETRACK is designed as an **offline-first PWA**. The system operates fully without an internet connection and synchronizes changes when connectivity is restored.

---

## IndexedDB Schema (v2)

Managed via the `idb` library (`src/lib/offline/db.ts`):

```
Database: TradeTrackDB (version 2)
├── offline_queue       — Pending mutations awaiting sync
├── products_cache      — Local product catalog for POS
├── user_sessions       — Cached user sessions for offline login
└── sales_cache         — Draft/in-progress sales
```

### Store: `user_sessions`

```typescript
interface UserSessionRecord {
  userId:    string;          // Supabase auth UID (keyPath)
  profile:   Record<string, unknown>; // Serialized user profile
  cachedAt:  string;          // ISO timestamp
  expiresAt: string;          // ISO timestamp (24h default)
}
```

### Store: `offline_queue`

```typescript
interface SyncQueueRecord {
  id:          string;        // auto-increment (keyPath)
  table:       string;        // Supabase table name
  operation:   'INSERT' | 'UPDATE' | 'DELETE';
  payload:     Record<string, unknown>;
  timestamp:   number;        // epoch ms
  retryCount:  number;        // max 3 retries
  synced:      boolean;
}
```

---

## Session Caching (Offline Login)

When a user logs in successfully while online, their session is cached in IndexedDB:

```typescript
// Called in AuthProvider after successful Supabase auth
await cacheUserSession(user.id, {
  id:              user.id,
  email:           user.email,
  full_name:       profile.full_name,
  role:            profile.role,
  organization_id: profile.organization_id,
  // ...other profile fields
});
```

When the user opens the app offline:

```typescript
// AuthProvider checks Supabase first, falls back to IndexedDB
const { data: { session } } = await supabase.auth.getSession();
if (!session && !navigator.onLine) {
  const cached = await getAnyCachedSession();
  if (cached && new Date(cached.expiresAt) > new Date()) {
    // Restore user state from cache
    authStore.setUser({ id: cached.userId, ...cached.profile });
  }
}
```

---

## Sync Engine (`src/lib/offline/sync-engine.ts`)

The sync engine manages bidirectional data synchronization between IndexedDB and Supabase.

### Sync Flow

```
1. ONLINE event fires (window.addEventListener('online', ...))
2. SyncEngine.syncAll() is called
3. Pull changes from Supabase (last-modified timestamp comparison)
4. Flush offline_queue mutations to Supabase
5. Update local cache with server responses
6. Emit sync completion event
```

### Conflict Resolution

TRADETRACK uses a **last-write-wins** strategy with server authority:

- Server data always wins during pull
- Offline mutations are replayed on reconnect
- If a mutation conflicts (e.g., product deleted on server), the record is removed from offline_queue and a notification is shown

### Retry Logic

Failed sync operations are retried up to 3 times with exponential backoff:

```
Retry 1: 2 seconds
Retry 2: 8 seconds
Retry 3: 30 seconds
→ Marked as failed after 3 retries (user notified)
```

---

## PWA Configuration

### manifest.json

```json
{
  "name": "TradeTrack",
  "short_name": "TradeTrack",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icons/icon-72x72.png",   "sizes": "72x72",   "type": "image/png" },
    { "src": "/icons/icon-96x96.png",   "sizes": "96x96",   "type": "image/png" },
    { "src": "/icons/icon-128x128.png", "sizes": "128x128", "type": "image/png" },
    { "src": "/icons/icon-144x144.png", "sizes": "144x144", "type": "image/png" },
    { "src": "/icons/icon-152x152.png", "sizes": "152x152", "type": "image/png" },
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-384x384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker Cache Strategy

| Resource Type  | Strategy           | TTL      |
|----------------|--------------------|----------|
| App shell      | Cache-first        | Forever  |
| API responses  | Network-first      | 5 min    |
| Product images | Stale-while-rev.   | 1 hour   |
| Static assets  | Cache-first        | 1 week   |

---

## Online Status Hook

```typescript
// src/hooks/use-online-status.ts
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

The header displays a live indicator that updates reactively.

---

## Testing Offline Mode

1. Open TRADETRACK in Chrome DevTools
2. Go to Application → Service Workers → check "Offline"
3. Or: Network tab → throttle to "Offline"
4. Verify you can log in (with a previously authenticated session)
5. Process a POS sale — it should queue to IndexedDB
6. Disable "Offline" simulation
7. Observe sync engine automatically flushing the queue
8. Verify the sale appears in the database
