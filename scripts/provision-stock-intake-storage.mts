// Explicit operator command; never run automatically during builds or migrations.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Configure server-only storage credentials");
if (process.argv[2] !== "--apply")
  throw new Error(
    "Review the target project and run with --apply to provision private storage",
  );
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const name = "stock-intake-originals",
  options = { public: false, fileSizeLimit: 20 * 1024 * 1024 };
const existing = await client.storage.getBucket(name);
if (existing.error && Number(existing.error.status) !== 404)
  throw new Error("Cannot inspect intake bucket; no changes made");
const saved = existing.data
  ? await client.storage.updateBucket(name, options)
  : await client.storage.createBucket(name, options);
if (saved.error) throw new Error("Private intake bucket provisioning failed");
console.log(
  "Private intake bucket configured. Verify deployed object policies before enabling intake.",
);
