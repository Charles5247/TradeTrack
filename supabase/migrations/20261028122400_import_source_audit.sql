BEGIN;
-- Keep before/after entity snapshots compatible with audited reversals.
-- Store the untouched export and cleaning decisions under reserved before keys.
DO $$
DECLARE definition text; old_fragment text := 'warehouse,qty) RETURNING * INTO result;';
BEGIN
 SELECT pg_get_functiondef('public.apply_import_row(uuid,integer,jsonb,text,uuid,uuid)'::regprocedure) INTO definition;
 IF position('_import_source' IN definition) > 0 THEN RETURN; END IF;
 IF position(old_fragment IN definition) = 0 THEN RAISE EXCEPTION 'Import function changed; review audit migration before applying'; END IF;
 definition := replace(definition,
   'err,before_row,after_row,warehouse,qty)',
   'err,CASE WHEN row_data ? ''_import_source'' THEN COALESCE(before_row,''{}''::jsonb) || jsonb_build_object(''_import_source'',row_data->''_import_source'',''_import_fixes'',row_data->''_import_fixes'',''_import_review_accepted'',row_data->''_import_review_accepted'') ELSE before_row END,after_row,warehouse,qty)');
 IF position('_import_source' IN definition) = 0 THEN RAISE EXCEPTION 'Import audit patch did not match'; END IF;
 EXECUTE definition;
END $$;
COMMIT;
