-- A deleted sale must not be recreated by an offline device on its next sync.
CREATE TABLE public.sale_reset_tombstones (
  sale_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sale_reset_tombstones_organization_id_idx
  ON public.sale_reset_tombstones (organization_id);

ALTER TABLE public.sale_reset_tombstones ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_reset_tombstones_read ON public.sale_reset_tombstones
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());
GRANT SELECT ON public.sale_reset_tombstones TO authenticated;
