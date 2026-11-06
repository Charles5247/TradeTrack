-- Product photos are public assets. Only signed-in users can upload to their
-- own folder, and only the original uploader can remove an object.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('product-images','product-images',true,10485760,ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=10485760,
  allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp','image/avif'];

DROP POLICY IF EXISTS product_images_insert_own ON storage.objects;
CREATE POLICY product_images_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='product-images' AND (storage.foldername(name))[1]=(SELECT auth.uid()::text));

DROP POLICY IF EXISTS product_images_delete_own ON storage.objects;
DROP POLICY IF EXISTS product_images_select_own ON storage.objects;
CREATE POLICY product_images_select_own ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='product-images' AND owner_id=(SELECT auth.uid()::text));
CREATE POLICY product_images_delete_own ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='product-images' AND owner_id=(SELECT auth.uid()::text));
