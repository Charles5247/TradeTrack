import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
    passWithNoTests: false,
    // jsdom (used by the offline/* suite via a per-file
    // `// @vitest-environment jsdom` directive) does not ship its own
    // IndexedDB implementation. fake-indexeddb/auto patches `global.indexedDB`
    // so `idb`-based code (src/lib/offline/db.ts) works under test.
    setupFiles: ['fake-indexeddb/auto'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
