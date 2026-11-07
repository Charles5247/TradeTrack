-- The memo and transfer exemptions were prepended to the shared sales/items/
-- inventory trigger. Evaluate inventory fields only for inventory rows.
DO $$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('track_private.guard_financial_change()'::regprocedure);
  IF position('IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.memo_write''' in definition) = 0
     OR position('IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.transfer_write''' in definition) = 0 THEN
    RAISE EXCEPTION 'Stock guard changed; review inventory exemption before installing';
  END IF;
  definition := replace(definition,
    'IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.memo_write''',
    'IF TG_TABLE_NAME=''inventory'' THEN IF current_setting(''track.memo_write''');
  definition := replace(definition,
    'IF TG_TABLE_NAME=''inventory'' AND current_setting(''track.transfer_write''',
    'IF TG_TABLE_NAME=''inventory'' THEN IF current_setting(''track.transfer_write''');
  definition := replace(definition,
    'THEN RETURN NEW; END IF; IF TG_TABLE_NAME=''inventory'' THEN IF current_setting(''track.memo_write''',
    'THEN RETURN NEW; END IF; END IF; IF TG_TABLE_NAME=''inventory'' THEN IF current_setting(''track.memo_write''');
  definition := replace(definition,
    'THEN RETURN NEW; END IF; IF role_name=''cashier'' THEN',
    'THEN RETURN NEW; END IF; END IF; IF role_name=''cashier'' THEN');
  EXECUTE definition;
END $$;
