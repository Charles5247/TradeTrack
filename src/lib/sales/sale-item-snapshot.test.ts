import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('backfills old sale names and freezes names on new sale items', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE SCHEMA track_private;
      CREATE TABLE public.products (id integer PRIMARY KEY, organization_id integer NOT NULL, name text NOT NULL);
      CREATE TABLE public.sales (id integer PRIMARY KEY, organization_id integer NOT NULL);
      CREATE TABLE public.sale_items (id integer PRIMARY KEY, sale_id integer NOT NULL REFERENCES public.sales(id), product_id integer NOT NULL REFERENCES public.products(id));
      CREATE FUNCTION track_private.immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'immutable'; END $$;
      CREATE TRIGGER item_immutable BEFORE UPDATE ON public.sale_items
      FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record();
      INSERT INTO public.products VALUES (1, 1, 'Original name');
      INSERT INTO public.sales VALUES (1, 1);
      INSERT INTO public.sale_items VALUES (1, 1, 1);`);
    await db.exec(readFileSync('supabase/migrations/20261112100000_sale_item_name_snapshot.sql', 'utf8'));
    expect((await db.query<{ product_name_snapshot: string }>('SELECT product_name_snapshot FROM public.sale_items WHERE id=1')).rows[0].product_name_snapshot).toBe('Original name');
    await db.exec(`UPDATE public.products SET name='Renamed product' WHERE id=1;
      INSERT INTO public.sale_items(id,sale_id,product_id,product_name_snapshot) VALUES(2,1,1,'Forged name');`);
    const names = (await db.query<{ product_name_snapshot: string }>('SELECT product_name_snapshot FROM public.sale_items ORDER BY id')).rows.map(row => row.product_name_snapshot);
    expect(names).toEqual(['Original name', 'Renamed product']);
    await expect(db.exec(`UPDATE public.sale_items SET product_name_snapshot='Changed' WHERE id=1`)).rejects.toThrow('immutable');
  } finally {
    await db.close();
  }
});
