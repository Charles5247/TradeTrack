BEGIN;
CREATE TABLE public.ai_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL REFERENCES public.users(id), kind text NOT NULL CHECK(kind IN ('inventory','insights')),
 result jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
 approved_at timestamptz, import_batch_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_preferences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL UNIQUE REFERENCES public.users(id), in_app boolean NOT NULL DEFAULT false, email boolean NOT NULL DEFAULT false, sms boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
 user_id uuid NOT NULL REFERENCES public.users(id), job_id uuid NOT NULL REFERENCES public.ai_jobs(id),
 channel text NOT NULL CHECK(channel IN ('in_app','email','sms')), status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(job_id,user_id,channel)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['ai_jobs','ai_preferences','ai_deliveries'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY ai_read ON public.%I FOR SELECT TO authenticated USING (organization_id=public.get_user_org_id() AND user_id=auth.uid())',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE INDEX ON public.%I(organization_id,user_id,created_at)',t);
  EXECUTE format('CREATE TRIGGER ai_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.capture_audit()',t);
  EXECUTE format('CREATE TRIGGER ai_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION track_private.immutable_record()',t);
 END LOOP;
END $$;
CREATE FUNCTION track_private.assert_ai_access() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb; org uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=auth.uid() AND role IN ('business_owner','admin') AND status='active') THEN RAISE EXCEPTION 'Owner or manager required'; END IF;
 v:=public.verify_business_subscription();org:=(v->>'organization_id')::uuid;
 IF NOT COALESCE((v->>'active')::boolean,false) OR NOT (
   COALESCE((v->>'trial_ends_at')::timestamptz>statement_timestamp(),false) OR
   COALESCE(v->>'plan_id' IN ('b3000000-0000-0000-0000-000000000003','b4000000-0000-0000-0000-000000000004','b5000000-0000-0000-0000-000000000005'),false)
 ) THEN RAISE EXCEPTION 'AI requires the introductory period or Growth and above'; END IF;
 RETURN org;
END $$;
REVOKE ALL ON FUNCTION track_private.assert_ai_access() FROM PUBLIC;
CREATE FUNCTION public.reserve_ai_job(job_kind text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; result uuid; BEGIN
 org:=track_private.assert_ai_access();PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 IF (SELECT count(*) FROM public.ai_jobs WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=20 THEN RAISE EXCEPTION 'AI request limit reached. Try again later'; END IF;
 INSERT INTO public.ai_jobs(organization_id,user_id,kind) VALUES(org,auth.uid(),job_kind) RETURNING id INTO result;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,reason) VALUES(org,auth.uid(),'AI_REQUEST','ai_jobs',result,'Trader requested assistance');
 RETURN result;
END $$;
CREATE FUNCTION public.finish_ai_job(job uuid, output jsonb, failed boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 org:=track_private.assert_ai_access();
 UPDATE public.ai_jobs SET result=output,status=CASE WHEN failed THEN 'failed' ELSE 'ready' END WHERE id=job AND organization_id=org AND user_id=auth.uid() AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending AI request not found'; END IF;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),CASE WHEN failed THEN 'AI_FAILED' ELSE 'AI_SUGGESTION' END,'ai_jobs',job,output);
END $$;
CREATE FUNCTION public.approve_ai_job(job uuid, batch uuid DEFAULT null) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; j public.ai_jobs; BEGIN
 org:=track_private.assert_ai_access();
 SELECT * INTO j FROM public.ai_jobs WHERE id=job AND organization_id=org AND user_id=auth.uid() AND status='ready' FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Ready suggestion not found'; END IF;
 IF j.kind='inventory' AND batch IS NULL THEN RAISE EXCEPTION 'An import preview batch is required'; END IF;
 IF j.import_batch_id IS NOT NULL AND j.import_batch_id IS DISTINCT FROM batch THEN RAISE EXCEPTION 'Suggestion already approved for another batch'; END IF;
 UPDATE public.ai_jobs SET approved_at=now(),import_batch_id=batch WHERE id=job;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),'AI_APPROVAL','ai_jobs',job,jsonb_build_object('import_batch_id',batch));
END $$;
CREATE FUNCTION public.set_ai_preferences(in_app_enabled boolean,email_enabled boolean,sms_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; BEGIN
 org:=track_private.assert_ai_access();
 INSERT INTO public.ai_preferences(organization_id,user_id,in_app,email,sms) VALUES(org,auth.uid(),in_app_enabled,email_enabled,sms_enabled)
 ON CONFLICT(user_id) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,sms=excluded.sms;
END $$;
CREATE FUNCTION public.reserve_ai_delivery(job uuid, delivery_channel text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; prefs public.ai_preferences; result uuid; BEGIN
 org:=track_private.assert_ai_access();PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||delivery_channel,2));
 IF NOT EXISTS(SELECT 1 FROM public.ai_jobs WHERE id=job AND organization_id=org AND user_id=auth.uid() AND approved_at IS NOT NULL AND kind='insights' AND status='ready') THEN RAISE EXCEPTION 'Approve the insight before delivery'; END IF;
 SELECT * INTO prefs FROM public.ai_preferences WHERE user_id=auth.uid();
 IF NOT COALESCE(CASE delivery_channel WHEN 'in_app' THEN prefs.in_app WHEN 'email' THEN prefs.email WHEN 'sms' THEN prefs.sms ELSE false END,false) THEN RAISE EXCEPTION 'Opt in to this delivery channel first'; END IF;
 IF (SELECT count(*) FROM public.ai_deliveries WHERE user_id=auth.uid() AND channel=delivery_channel AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Channel delivery limit reached'; END IF;
 INSERT INTO public.ai_deliveries(organization_id,user_id,job_id,channel) VALUES(org,auth.uid(),job,delivery_channel) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.complete_ai_delivery(delivery uuid, succeeded boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid; d public.ai_deliveries; j public.ai_jobs; BEGIN
 org:=track_private.assert_ai_access();
 UPDATE public.ai_deliveries SET status=CASE WHEN succeeded THEN 'sent' ELSE 'failed' END WHERE id=delivery AND user_id=auth.uid() AND organization_id=org AND status='reserved' RETURNING * INTO d;
 IF d.id IS NULL THEN RAISE EXCEPTION 'Reserved delivery not found'; END IF;
 IF succeeded AND d.channel='in_app' THEN
  SELECT * INTO j FROM public.ai_jobs WHERE id=d.job_id;
  INSERT INTO public.notifications(organization_id,user_id,type,title,message,data) VALUES(org,auth.uid(),'ai_insight','TracKasuwa insights (stub)',COALESCE(j.result->>'summary','Organization-only insights are ready'),jsonb_build_object('job_id',j.id,'stub',true));
 END IF;
 INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values) VALUES(org,auth.uid(),CASE WHEN succeeded THEN 'AI_EXECUTED' ELSE 'AI_DELIVERY_FAILED' END,'ai_deliveries',delivery,jsonb_build_object('channel',d.channel));
END $$;
CREATE FUNCTION track_private.audit_ai_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job uuid; BEGIN
 SELECT id INTO job FROM public.ai_jobs WHERE organization_id=NEW.organization_id AND import_batch_id=NEW.import_batch_id AND approved_at IS NOT NULL LIMIT 1;
 IF job IS NOT NULL THEN
  INSERT INTO public.audit_logs(organization_id,user_id,action,resource_type,resource_id,new_values,correlation_id) VALUES(NEW.organization_id,auth.uid(),'AI_EXECUTED',NEW.target_type,NEW.entity_id,jsonb_build_object('job_id',job,'outcome',NEW.outcome,'row',NEW.row_number),NEW.import_batch_id);
 END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.audit_ai_import() FROM PUBLIC;
CREATE TRIGGER ai_import_execution AFTER INSERT ON public.import_rows FOR EACH ROW EXECUTE FUNCTION track_private.audit_ai_import();
REVOKE ALL ON FUNCTION public.reserve_ai_job(text),public.finish_ai_job(uuid,jsonb,boolean),public.approve_ai_job(uuid,uuid),public.set_ai_preferences(boolean,boolean,boolean),public.reserve_ai_delivery(uuid,text),public.complete_ai_delivery(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_job(text),public.finish_ai_job(uuid,jsonb,boolean),public.approve_ai_job(uuid,uuid),public.set_ai_preferences(boolean,boolean,boolean),public.reserve_ai_delivery(uuid,text),public.complete_ai_delivery(uuid,boolean) TO authenticated;
COMMIT;
