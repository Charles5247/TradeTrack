-- The older two-argument overload may exist on projects that applied an
-- earlier version of the reset migration. It must not remain callable.
DO $$
BEGIN
  IF to_regprocedure('public.reset_thrive_well_sales_history(uuid, uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.reset_thrive_well_sales_history(uuid, uuid)
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END $$;
