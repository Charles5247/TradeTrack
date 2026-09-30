BEGIN;
DO $$
DECLARE u record; msg text; detail text; affected integer; results jsonb := '[]'::jsonb;
BEGIN
  FOR u IN SELECT id,role FROM public.users WHERE status='active' ORDER BY role,id LOOP
    PERFORM set_config('request.jwt.claim.sub',u.id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
    BEGIN
      SET LOCAL ROLE authenticated;
      WITH updated AS (UPDATE public.users SET full_name=trim(full_name), phone=nullif(trim(phone),''), updated_at=now() WHERE id=u.id RETURNING *) SELECT count(*) INTO affected FROM updated;
      
      RESET ROLE;
      results := results || jsonb_build_object('role',u.role,'rows',affected,'ok',true);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT,detail=PG_EXCEPTION_CONTEXT;
      RESET ROLE;
      results := results || jsonb_build_object('role',u.role,'code',SQLSTATE,'error',msg,'context',detail);
    END;
  END LOOP;
RAISE EXCEPTION 'ROLLBACK diagnostic: %',results;
END $$;
ROLLBACK;


