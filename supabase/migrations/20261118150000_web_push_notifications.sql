-- Device subscriptions are private. Only the authenticated API registers a
-- device; delivery uses the server role and never exposes endpoint keys.
CREATE TABLE public.notification_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_push_subscriptions_user_idx ON public.notification_push_subscriptions(user_id);
ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_push_subscriptions TO service_role;

CREATE TABLE public.notification_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.notification_push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX notification_push_outbox_pending_idx ON public.notification_push_outbox(status, created_at) WHERE status IN ('pending','failed');
ALTER TABLE public.notification_push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_push_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_push_outbox TO service_role;

CREATE FUNCTION track_private.queue_notification_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.in_app_visible THEN
    INSERT INTO public.notification_push_outbox(notification_id, subscription_id)
      SELECT NEW.id, s.id FROM public.notification_push_subscriptions s
      WHERE s.user_id = NEW.user_id
        AND s.organization_id IS NOT DISTINCT FROM NEW.organization_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION track_private.queue_notification_push() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_notification_push AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION track_private.queue_notification_push();
