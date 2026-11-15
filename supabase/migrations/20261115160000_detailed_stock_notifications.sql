-- Keep owner alerts specific enough to act on; preserve existing notification rows.
CREATE OR REPLACE FUNCTION public.notify_owner_for_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; event_type text; product_name text; warehouse_name text;
        direction text; detail text;
BEGIN
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL OR NEW.movement_type='transfer' THEN RETURN NEW; END IF;
  SELECT name INTO product_name FROM public.products WHERE id=NEW.product_id AND organization_id=NEW.organization_id;
  SELECT name INTO warehouse_name FROM public.warehouses WHERE id=NEW.warehouse_id AND organization_id=NEW.organization_id;
  event_type := CASE WHEN NEW.movement_type='adjustment' THEN 'stock_adjustment'
                     WHEN NEW.movement_type IN ('sale','out') THEN 'stock_out'
                     ELSE 'stock_in' END;
  direction := CASE WHEN event_type='stock_out' OR (event_type='stock_adjustment' AND NEW.quantity<0) THEN 'removed' ELSE 'added' END;
  detail := format('%s: %s unit(s) %s at %s.',
    COALESCE(product_name,'Product'),abs(NEW.quantity),
    direction,COALESCE(warehouse_name,'warehouse'));
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner',NEW.created_by,event_type,
    CASE WHEN NEW.movement_type='sale' THEN 'Stock sold' WHEN event_type='stock_out' THEN 'Stock removed' WHEN event_type='stock_adjustment' THEN 'Stock adjusted' ELSE 'Stock received' END,
    detail,detail,'info','product',NEW.product_id,
    'movement:'||NEW.id||':owner:'||owner_id,
    jsonb_build_object('product_id',NEW.product_id,'product_name',product_name,'warehouse_id',NEW.warehouse_id,'warehouse_name',warehouse_name,'quantity',NEW.quantity,'movement_type',NEW.movement_type))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_owner_for_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; product_name text; warehouse_name text; detail text; event_type text;
BEGIN
  IF NEW.quantity>COALESCE(NEW.min_stock_level,0) OR (TG_OP='UPDATE' AND OLD.quantity<=COALESCE(OLD.min_stock_level,0)) THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT name INTO product_name FROM public.products WHERE id=NEW.product_id AND organization_id=NEW.organization_id;
  SELECT name INTO warehouse_name FROM public.warehouses WHERE id=NEW.warehouse_id AND organization_id=NEW.organization_id;
  event_type := CASE WHEN NEW.quantity<=0 THEN 'out_of_stock' ELSE 'low_stock' END;
  detail := format('%s at %s: %s unit(s) remaining; alert level %s.',
    COALESCE(product_name,'Product'),COALESCE(warehouse_name,'warehouse'),NEW.quantity,COALESCE(NEW.min_stock_level,0));
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner',event_type,
    CASE WHEN event_type='out_of_stock' THEN 'Out of stock' ELSE 'Low stock' END,
    detail,detail,'warning','product',NEW.product_id,
    'low-stock:'||NEW.id||':'||NEW.updated_at,
    jsonb_build_object('product_id',NEW.product_id,'product_name',product_name,'warehouse_id',NEW.warehouse_id,'warehouse_name',warehouse_name,'quantity',NEW.quantity,'min_stock_level',NEW.min_stock_level))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_owner_for_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; item_count integer; item_names text; detail text;
BEGIN
  SELECT id INTO owner_id FROM public.users WHERE organization_id=NEW.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(si.quantity),0)::integer,
    string_agg(COALESCE(p.name,'Product')||' x '||si.quantity::text, ', ' ORDER BY p.name)
    INTO item_count,item_names
    FROM public.sale_items si LEFT JOIN public.products p ON p.id=si.product_id
    WHERE si.sale_id=NEW.id;
  detail := format('%s sold %s for NGN %s at %s. Products: %s.',
    COALESCE((SELECT full_name FROM public.users WHERE id=NEW.cashier_id),'A staff member'),
    item_count,NEW.total,
    COALESCE((SELECT name FROM public.warehouses WHERE id=NEW.warehouse_id),'warehouse'),
    COALESCE(item_names,'items pending sync'));
  INSERT INTO public.notifications(organization_id,user_id,recipient_role,staff_user_id,type,title,message,body,severity,entity_type,entity_id,dedupe_key,data)
  VALUES(NEW.organization_id,owner_id,'business_owner',NEW.cashier_id,'sale_made','Sale completed',detail,detail,'info','sale',NEW.id,
    'sale:'||NEW.id||':owner:'||owner_id,
    jsonb_build_object('cashier_id',NEW.cashier_id,'amount',NEW.total,'items_count',item_count,'payment_method',NEW.payment_method,'invoice_number',NEW.invoice_number))
  ON CONFLICT (organization_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_sale_notification_item_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sale_row public.sales; owner_id uuid; item_count integer; item_names text; detail text;
BEGIN
  SELECT * INTO sale_row FROM public.sales WHERE id=NEW.sale_id;
  IF sale_row.id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO owner_id FROM public.users WHERE organization_id=sale_row.organization_id AND role='business_owner' AND status='active' ORDER BY created_at LIMIT 1;
  IF owner_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(si.quantity),0)::integer,
    string_agg(COALESCE(p.name,'Product')||' x '||si.quantity::text, ', ' ORDER BY p.name)
    INTO item_count,item_names
    FROM public.sale_items si LEFT JOIN public.products p ON p.id=si.product_id
    WHERE si.sale_id=NEW.sale_id;
  detail := format('%s sold %s for NGN %s at %s. Products: %s.',
    COALESCE((SELECT full_name FROM public.users WHERE id=sale_row.cashier_id),'A staff member'),
    item_count,sale_row.total,
    COALESCE((SELECT name FROM public.warehouses WHERE id=sale_row.warehouse_id),'warehouse'),
    COALESCE(item_names,'items pending sync'));
  UPDATE public.notifications SET message=detail,body=detail,data=data||jsonb_build_object('items_count',item_count)
   WHERE organization_id=sale_row.organization_id AND dedupe_key='sale:'||sale_row.id||':owner:'||owner_id;
  RETURN NEW;
END $$;
