BEGIN;
-- Number allocation and legacy backfill happened in 014. Once assigned,
-- official numbers must never be changed through an UPDATE, even by an owner.
CREATE FUNCTION track_private.protect_invoice_number() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.official_invoice_number IS DISTINCT FROM OLD.official_invoice_number THEN
  RAISE EXCEPTION 'Official invoice numbers are immutable';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.protect_invoice_number() FROM PUBLIC;
CREATE TRIGGER protect_official_invoice_number BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION track_private.protect_invoice_number();

-- New accounts must reach payment-confirmed activation. The legacy signup
-- handler's unconfirmed trial must not grant transaction/AI entitlement.
CREATE OR REPLACE FUNCTION public.verify_business_subscription() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE org public.organizations; sub public.subscriptions; active boolean;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT o.* INTO org FROM public.organizations o JOIN public.users u ON u.organization_id=o.id WHERE u.id=auth.uid() AND u.status='active';
 IF org.id IS NULL THEN RAISE EXCEPTION 'Business membership required'; END IF;
 SELECT * INTO sub FROM public.subscriptions WHERE organization_id=org.id ORDER BY created_at DESC,id DESC LIMIT 1;
 active:=COALESCE(sub.status IN ('active','trial') AND
   (NOT org.intro_eligible OR org.trial_started_at IS NOT NULL) AND
   (sub.expires_at>statement_timestamp() OR org.trial_ends_at>statement_timestamp()),false);
 RETURN jsonb_build_object('organization_id',org.id,'active',active,'server_time',statement_timestamp(),'trial_ends_at',org.trial_ends_at,'subscription_period_start',org.subscription_period_start,'plan_id',sub.plan_id);
END $$;

-- Old clients have no sale FK on stock changes. Do not guess when their
-- device timestamps collide; require reconciliation instead of double stock.
CREATE FUNCTION track_private.guard_reversal_stock_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sold_at timestamptz;
BEGIN
 IF NEW.kind IN ('void','refund','return') THEN
  SELECT created_at INTO sold_at FROM public.sales WHERE id=NEW.sale_id;
  IF (SELECT count(*) FROM public.sales WHERE organization_id=NEW.organization_id AND created_at=sold_at)>1 THEN
   RAISE EXCEPTION 'Ambiguous stock link; reconcile this sale before reversal';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.guard_reversal_stock_link() FROM PUBLIC;
CREATE TRIGGER protect_reversal_stock_link BEFORE INSERT ON public.financial_reversals FOR EACH ROW EXECUTE FUNCTION track_private.guard_reversal_stock_link();
COMMIT;
