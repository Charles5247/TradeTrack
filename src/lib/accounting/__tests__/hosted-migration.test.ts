import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('supports the hosted extensions schema without exposing the digest wrapper', async () => {
 const db = new PGlite({ extensions: { pgcrypto } });
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
  const sql = readFileSync('supabase/migrations/018_pgcrypto_schema_compatibility.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  const result = await db.query<{valid:boolean; exposed:boolean}>(`SELECT public.digest('abc'::bytea,'sha256')=extensions.digest('abc'::bytea,'sha256') valid, has_function_privilege('authenticated','public.digest(bytea,text)','EXECUTE') exposed`);
  expect(result.rows[0]).toEqual({ valid: true, exposed: false });
 } finally { await db.close(); }
},120000);
