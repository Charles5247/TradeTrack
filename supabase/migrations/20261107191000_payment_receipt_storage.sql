-- POS and vendor payment proofs use fresh object names under the uploader's ID.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS receipts_insert_own ON storage.objects;
CREATE POLICY receipts_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid()::text));

DROP POLICY IF EXISTS receipts_select_own ON storage.objects;
CREATE POLICY receipts_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts' AND owner_id = (SELECT auth.uid()::text));
