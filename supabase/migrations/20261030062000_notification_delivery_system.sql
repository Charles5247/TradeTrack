BEGIN;

-- Extend the legacy table in place so existing rows and clients keep working.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_role text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'info';
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS staff_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS in_app_visible boolean NOT NULL DEFAULT true;
-- Platform owners are global users with no organization_id; direct user_id targeting still isolates these rows.
ALTER TABLE public.notifications ALTER COLUMN organization_id DROP NOT NULL;
UPDATE public.notifications SET body = message WHERE body IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_org_dedupe_key
  ON public.notifications(organization_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_recipient_feed
  ON public.notifications(organization_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_feed
  ON public.notifications(organization_id, user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS notifications_type_staff_feed
  ON public.notifications(organization_id, type, staff_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_notification_compatibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.body := COALESCE(NEW.body, NEW.message);
  NEW.message := COALESCE(NEW.message, NEW.body);
  IF NEW.is_read AND NEW.read_at IS NULL THEN NEW.read_at := now(); END IF;
  IF NOT NEW.is_read THEN NEW.read_at := NULL; END IF;
  SELECT COALESCE(p.in_app_enabled,true) INTO NEW.in_app_visible
    FROM public.notification_preferences p WHERE p.user_id=NEW.user_id AND p.event_type=NEW.type;
  NEW.in_app_visible := COALESCE(NEW.in_app_visible,true);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sync_notification_compatibility ON public.notifications;
CREATE TRIGGER sync_notification_compatibility BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.sync_notification_compatibility();

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  sms_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_type)
);

CREATE TABLE IF NOT EXISTS public.notification_channel_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  sms_provider text,
  sms_provider_enabled boolean NOT NULL DEFAULT false,
  sms_unit_price_kobo integer CHECK (sms_unit_price_kobo IS NULL OR sms_unit_price_kobo > 0),
  low_balance_threshold_credits bigint NOT NULL DEFAULT 10 CHECK (low_balance_threshold_credits >= 0),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT sms_provider_enabled OR (sms_provider IS NOT NULL AND sms_unit_price_kobo IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.sms_credit_accounts (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_credits bigint NOT NULL DEFAULT 0 CHECK (balance_credits >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('purchase','usage','refund','adjustment')),
  credits bigint NOT NULL CHECK (credits <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  amount_kobo bigint CHECK (amount_kobo IS NULL OR amount_kobo >= 0),
  payment_reference text,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_reference)
);
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_one_usage_per_notification ON public.sms_credit_transactions(notification_id) WHERE kind='usage';
CREATE UNIQUE INDEX IF NOT EXISTS sms_credit_one_refund_per_notification ON public.sms_credit_transactions(notification_id) WHERE kind='refund';

CREATE TABLE IF NOT EXISTS public.sms_credit_checkouts (
  reference text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id),
  credits bigint NOT NULL CHECK (credits > 0),
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  mode text NOT NULL CHECK (mode IN ('test','live')),
  zainbox_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(notification_id, channel)
);

CREATE OR REPLACE FUNCTION public.queue_notification_channels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE preference public.notification_preferences;
BEGIN
  SELECT * INTO preference FROM public.notification_preferences WHERE user_id=NEW.user_id AND event_type=NEW.type;
  IF preference.email_enabled THEN
    INSERT INTO public.notification_delivery_outbox(notification_id,organization_id,channel) VALUES(NEW.id,NEW.organization_id,'email') ON CONFLICT DO NOTHING;
  END IF;
  IF preference.sms_enabled THEN
    INSERT INTO public.notification_delivery_outbox(notification_id,organization_id,channel) VALUES(NEW.id,NEW.organization_id,'sms') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS queue_notification_channels ON public.notifications;
CREATE TRIGGER queue_notification_channels AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.queue_notification_channels();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_channel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credit_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_preferences' AND policyname='notification_preferences_own') THEN
    CREATE POLICY notification_preferences_own ON public.notification_preferences FOR ALL
      USING (organization_id = public.get_user_org_id() AND user_id = auth.uid())
      WITH CHECK (organization_id = public.get_user_org_id() AND user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_channel_settings' AND policyname='notification_channel_settings_org') THEN
    CREATE POLICY notification_channel_settings_org ON public.notification_channel_settings FOR SELECT USING (organization_id = public.get_user_org_id());
    CREATE POLICY notification_channel_settings_manage ON public.notification_channel_settings FOR ALL
      USING (organization_id = public.get_user_org_id() AND public.is_admin_or_above())
      WITH CHECK (organization_id = public.get_user_org_id() AND public.is_admin_or_above());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_credit_accounts' AND policyname='sms_credit_accounts_org') THEN
    CREATE POLICY sms_credit_accounts_org ON public.sms_credit_accounts FOR SELECT USING (organization_id = public.get_user_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_credit_transactions' AND policyname='sms_credit_transactions_org') THEN
    CREATE POLICY sms_credit_transactions_org ON public.sms_credit_transactions FOR SELECT USING (organization_id = public.get_user_org_id());
  END IF;
END $$;

DROP POLICY IF EXISTS notifications_select_user ON public.notifications;
CREATE POLICY notifications_select_user ON public.notifications FOR SELECT USING (
  in_app_visible AND user_id=auth.uid() AND
  (organization_id=public.get_user_org_id() OR public.get_user_role()='platform_owner')
);

REVOKE ALL ON public.sms_credit_checkouts, public.notification_delivery_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sms_credit_checkouts, public.notification_delivery_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_sms_credit_checkout(p_reference text, p_amount_kobo bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE checkout public.sms_credit_checkouts; next_balance bigint;
BEGIN
  SELECT * INTO checkout FROM public.sms_credit_checkouts WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout not found'; END IF;
  IF checkout.amount_kobo<>p_amount_kobo THEN RAISE EXCEPTION 'Payment amount mismatch'; END IF;
  IF checkout.mode<>'live' THEN RAISE EXCEPTION 'Sandbox payments cannot buy live credits'; END IF;
  IF checkout.status='paid' THEN
    SELECT balance_credits INTO next_balance FROM public.sms_credit_accounts WHERE organization_id=checkout.organization_id;
    RETURN jsonb_build_object('balance_credits',COALESCE(next_balance,0),'already_processed',true);
  END IF;
  INSERT INTO public.sms_credit_accounts(organization_id,balance_credits) VALUES(checkout.organization_id,checkout.credits)
  ON CONFLICT(organization_id) DO UPDATE SET balance_credits=public.sms_credit_accounts.balance_credits+EXCLUDED.balance_credits,updated_at=now()
  RETURNING balance_credits INTO next_balance;
  INSERT INTO public.sms_credit_transactions(organization_id,kind,credits,balance_after,amount_kobo,payment_reference)
  VALUES(checkout.organization_id,'purchase',checkout.credits,next_balance,checkout.amount_kobo,checkout.reference);
  UPDATE public.sms_credit_checkouts SET status='paid',paid_at=now() WHERE reference=p_reference;
  RETURN jsonb_build_object('balance_credits',next_balance,'already_processed',false);
END $$;
REVOKE ALL ON FUNCTION public.finalize_sms_credit_checkout(text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_sms_credit_checkout(text,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_sms_credit(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE org uuid; next_balance bigint;
BEGIN
  SELECT organization_id INTO org FROM public.notifications WHERE id=p_notification_id;
  IF org IS NULL THEN RETURN false; END IF;
  UPDATE public.sms_credit_accounts SET balance_credits=balance_credits-1,updated_at=now()
   WHERE organization_id=org AND balance_credits>0 RETURNING balance_credits INTO next_balance;
  IF next_balance IS NULL THEN RETURN false; END IF;
  INSERT INTO public.sms_credit_transactions(organization_id,kind,credits,balance_after,notification_id)
  VALUES(org,'usage',-1,next_balance,p_notification_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_sms_credit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_sms_credit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_sms_credit(p_notification_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE org uuid; next_balance bigint;
BEGIN
  SELECT organization_id INTO org FROM public.sms_credit_transactions WHERE notification_id=p_notification_id AND kind='usage';
  IF org IS NULL OR EXISTS(SELECT 1 FROM public.sms_credit_transactions WHERE notification_id=p_notification_id AND kind='refund') THEN RETURN false; END IF;
  UPDATE public.sms_credit_accounts SET balance_credits=balance_credits+1,updated_at=now() WHERE organization_id=org RETURNING balance_credits INTO next_balance;
  INSERT INTO public.sms_credit_transactions(organization_id,kind,credits,balance_after,notification_id) VALUES(org,'refund',1,next_balance,p_notification_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.refund_sms_credit(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_sms_credit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_owner_for_low_sms_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; threshold bigint;
BEGIN
  SELECT low_balance_threshold_credits INTO threshold FROM public.notification_channel_settings WHERE organization_id=NEW.organization_id;
  IF threshold IS NULL OR NEW.balance_credits>threshold OR (TG_OP='UPDATE' AND OLD.balance_credits<=threshold) THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner','low_sms_balance','SMS credits running low',format('%s SMS credit(s) remain. Buy credits to keep optional SMS delivery active.',NEW.balance_credits),format('%s SMS credit(s) remain. Buy credits to keep optional SMS delivery active.',NEW.balance_credits),'warning','organization',NEW.organization_id,'sms-low-balance:'||NEW.organization_id||':'||NEW.updated_at,jsonb_build_object('balance_credits',NEW.balance_credits))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_owner_for_low_sms_balance ON public.sms_credit_accounts;
CREATE TRIGGER notify_owner_for_low_sms_balance AFTER INSERT OR UPDATE OF balance_credits ON public.sms_credit_accounts FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_low_sms_balance();

CREATE OR REPLACE FUNCTION public.notify_owner_for_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; item_count integer;
BEGIN
  SELECT id INTO owner_id FROM public.users
   WHERE organization_id = NEW.organization_id AND role = 'business_owner' AND status = 'active'
   ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(quantity),0)::integer INTO item_count FROM public.sale_items WHERE sale_id = NEW.id;
  INSERT INTO public.notifications(
    organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,
    entity_type,entity_id,dedupe_key,data
  ) VALUES (
    NEW.organization_id,owner_id,'business_owner',NEW.cashier_id,'sale_made','Sale completed',
    format('%s recorded a %s sale of NGN %s for %s item(s).',COALESCE((SELECT full_name FROM public.users WHERE id=NEW.cashier_id),'A staff member'),NEW.payment_method,NEW.total,item_count),
    format('%s recorded a %s sale of NGN %s for %s item(s).',COALESCE((SELECT full_name FROM public.users WHERE id=NEW.cashier_id),'A staff member'),NEW.payment_method,NEW.total,item_count),
    'info','sale',NEW.id,'sale:'||NEW.id||':owner:'||owner_id,
    jsonb_build_object('cashier_id',NEW.cashier_id,'amount',NEW.total,'items_count',item_count,'payment_method',NEW.payment_method,'invoice_number',NEW.invoice_number)
  ) ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_owner_for_sale ON public.sales;
CREATE CONSTRAINT TRIGGER notify_owner_for_sale AFTER INSERT ON public.sales
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_sale();

CREATE OR REPLACE FUNCTION public.refresh_sale_notification_item_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sale_row public.sales; owner_id uuid; item_count integer; staff_name text; next_body text;
BEGIN
  SELECT * INTO sale_row FROM public.sales WHERE id=NEW.sale_id;
  IF sale_row.id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=sale_row.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(quantity),0)::integer INTO item_count FROM public.sale_items WHERE sale_id=NEW.sale_id;
  SELECT COALESCE(full_name,'A staff member') INTO staff_name FROM public.users WHERE id=sale_row.cashier_id;
  next_body := format('%s recorded a %s sale of NGN %s for %s item(s).',COALESCE(staff_name,'A staff member'),sale_row.payment_method,sale_row.total,item_count);
  UPDATE public.notifications SET message=next_body,body=next_body,data=data||jsonb_build_object('items_count',item_count)
   WHERE organization_id=sale_row.organization_id AND dedupe_key='sale:'||sale_row.id||':owner:'||owner_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS refresh_sale_notification_item_count ON public.sale_items;
CREATE TRIGGER refresh_sale_notification_item_count AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.refresh_sale_notification_item_count();

CREATE OR REPLACE FUNCTION public.notify_owner_for_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; event_type text;
BEGIN
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  event_type := CASE WHEN NEW.movement_type='adjustment' THEN 'stock_adjustment' ELSE 'stock_in' END;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner',NEW.created_by,event_type,
    CASE WHEN event_type='stock_adjustment' THEN 'Stock adjusted' ELSE 'Stock received' END,
    format('Stock changed by %s unit(s).',NEW.quantity),format('Stock changed by %s unit(s).',NEW.quantity),'info','product',NEW.product_id,
    'movement:'||NEW.id||':owner:'||owner_id,jsonb_build_object('product_id',NEW.product_id,'warehouse_id',NEW.warehouse_id,'quantity',NEW.quantity,'movement_type',NEW.movement_type))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_owner_for_stock_movement ON public.inventory_movements;
CREATE TRIGGER notify_owner_for_stock_movement AFTER INSERT ON public.inventory_movements
FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_stock_movement();

CREATE OR REPLACE FUNCTION public.notify_owner_for_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; product_name text;
BEGIN
  IF NEW.quantity>NEW.min_stock_level OR (TG_OP='UPDATE' AND OLD.quantity<=OLD.min_stock_level) THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  SELECT name INTO product_name FROM public.products WHERE id=NEW.product_id;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner','low_stock','Low stock',format('%s has %s unit(s) remaining.',COALESCE(product_name,'A product'),NEW.quantity),format('%s has %s unit(s) remaining.',COALESCE(product_name,'A product'),NEW.quantity),'warning','product',NEW.product_id,'low-stock:'||NEW.id||':'||NEW.updated_at,jsonb_build_object('product_id',NEW.product_id,'warehouse_id',NEW.warehouse_id,'quantity',NEW.quantity,'min_stock_level',NEW.min_stock_level))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_owner_for_low_stock ON public.inventory;
CREATE TRIGGER notify_owner_for_low_stock AFTER INSERT OR UPDATE OF quantity ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_low_stock();

CREATE OR REPLACE FUNCTION public.notify_owner_for_staff_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.role='business_owner' OR NEW.last_login IS NOT DISTINCT FROM OLD.last_login THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner',NEW.id,'staff_login','Staff login',format('%s signed in.',NEW.full_name),format('%s signed in.',NEW.full_name),'info','user',NEW.id,'login:'||NEW.id||':'||NEW.last_login,jsonb_build_object('staff_user_id',NEW.id,'last_login',NEW.last_login))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_owner_for_staff_login ON public.users;
CREATE TRIGGER notify_owner_for_staff_login AFTER UPDATE OF last_login ON public.users FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_staff_login();

CREATE OR REPLACE FUNCTION public.notify_platform_for_merchant_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE platform_user record;
BEGIN
  FOR platform_user IN SELECT id FROM public.users WHERE role='platform_owner' AND status='active' LOOP
    INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
    VALUES(NEW.id,platform_user.id,'platform_owner','merchant_signup','New merchant signup',format('%s created a TracKasuwa business account.',NEW.name),format('%s created a TracKasuwa business account.',NEW.name),'info','organization',NEW.id,'merchant-signup:'||NEW.id||':'||platform_user.id,jsonb_build_object('organization_name',NEW.name))
    ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_platform_for_merchant_signup ON public.organizations;
CREATE TRIGGER notify_platform_for_merchant_signup AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.notify_platform_for_merchant_signup();

CREATE OR REPLACE FUNCTION public.notify_owner_for_operational_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payload jsonb := to_jsonb(NEW); org uuid; owner_id uuid; event_type text; event_status text; row_id uuid;
BEGIN
  org := NULLIF(payload->>'organization_id','')::uuid;
  row_id := NULLIF(payload->>'id','')::uuid;
  event_status := COALESCE(payload->>'status','updated');
  SELECT id INTO owner_id FROM public.users WHERE organization_id=org AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  event_type := CASE TG_TABLE_NAME WHEN 'purchase_orders' THEN 'purchase_order_status' WHEN 'warehouse_transfers' THEN 'pending_transfer' WHEN 'import_batches' THEN CASE WHEN event_status IN ('failed','error') THEN 'import_failed' ELSE 'import_finished' END WHEN 'payment_transactions' THEN CASE WHEN event_status IN ('success','paid','confirmed') THEN 'payment_confirmed' ELSE 'payment_failed' END WHEN 'subscriptions' THEN 'subscription_changed' ELSE 'general' END;
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(org,owner_id,'business_owner',event_type,replace(initcap(event_type),'_',' '),format('%s changed to %s.',replace(TG_TABLE_NAME,'_',' '),event_status),format('%s changed to %s.',replace(TG_TABLE_NAME,'_',' '),event_status),CASE WHEN event_type IN ('import_failed','payment_failed') THEN 'error' ELSE 'info' END,TG_TABLE_NAME,row_id,TG_TABLE_NAME||':'||row_id||':'||event_status||':owner:'||owner_id,payload)
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['purchase_orders','warehouse_transfers','import_batches','payment_transactions','subscriptions'] LOOP
    IF to_regclass('public.'||table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS notify_owner_operational_event ON public.%I',table_name);
      EXECUTE format('CREATE TRIGGER notify_owner_operational_event AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.notify_owner_for_operational_event()',table_name);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_scheduled_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted_count integer;
BEGIN
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  SELECT o.id,u.id,'business_owner',CASE WHEN o.trial_ends_at<=now() THEN 'trial_expired' ELSE 'trial_ending' END,
    CASE WHEN o.trial_ends_at<=now() THEN 'Trial expired' ELSE 'Trial ending soon' END,
    CASE WHEN o.trial_ends_at<=now() THEN 'Your free trial has ended. Choose a plan to create new transactions.' ELSE 'Your free trial ends soon. Review the recommended plan for your business.' END,
    CASE WHEN o.trial_ends_at<=now() THEN 'Your free trial has ended. Choose a plan to create new transactions.' ELSE 'Your free trial ends soon. Review the recommended plan for your business.' END,
    'warning','organization',o.id,'trial:'||o.id||':'||current_date||':'||u.id,jsonb_build_object('trial_ends_at',o.trial_ends_at)
  FROM public.organizations o JOIN public.users u ON u.organization_id=o.id AND u.role='business_owner' AND u.status='active'
  WHERE o.subscription_status='trial' AND o.trial_ends_at<=now()+interval '7 days'
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END $$;
REVOKE ALL ON FUNCTION public.generate_scheduled_notifications() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_scheduled_notifications() TO service_role;

-- Realtime is best effort and idempotent; polling remains the client fallback.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

COMMIT;

-- Verification query to run after applying this file live:
-- SELECT json_build_object(
--   'columns',(SELECT json_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications'),
--   'sale_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.sales'::regclass AND tgname='notify_owner_for_sale' AND NOT tgisinternal),
--   'stock_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.inventory_movements'::regclass AND tgname='notify_owner_for_stock_movement' AND NOT tgisinternal),
--   'preferences',to_regclass('public.notification_preferences') IS NOT NULL,
--   'sms_credits',to_regclass('public.sms_credit_accounts') IS NOT NULL,
--   'realtime',EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications'));
