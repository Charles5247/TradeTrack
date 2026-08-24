-- ============================================================
-- Migration 011: Purchase Orders (minimal, intentionally scoped)
-- ============================================================
-- BACKGROUND
-- `purchase_orders` has been a catalogued Business-tier feature flag
-- (see 010_five_tier_subscription_plans.sql's seeded plan features)
-- since the 5-tier restructure, but had no actual product surface --
-- a customer paying for the Business plan could not use it. This
-- migration builds the minimum real workflow needed to make that
-- flag honest: Create (draft) -> Send -> Receive, with Receive
-- updating inventory via the SAME read-qty -> upsert inventory ->
-- insert inventory_movements pattern already used by
-- inventory/page.tsx, transfers/page.tsx and vendors/page.tsx (see
-- inventory/page.tsx's adjustStock()). No new inventory-mutation
-- mechanism is introduced.
--
-- EXPLICITLY OUT OF SCOPE (see docs/ROADMAP.md):
--   partial receiving, PO approval workflows, PDF export, purchasing
--   analytics, supplier payment automation, complex procurement,
--   cross-device sync beyond what Supabase already provides.
--
-- CONVENTIONS MIRRORED FROM EXISTING SCHEMA/RLS
--   - UUID PKs via uuid_generate_v4(), organization_id FK with
--     ON DELETE CASCADE (001_initial_schema.sql).
--   - created_at/updated_at TIMESTAMPTZ DEFAULT NOW(), with an
--     update_updated_at_column() trigger on the parent table only
--     (line items have no independent updated_at, matching
--     vendor_transaction_items / sale_items, which don't either).
--   - RLS helper functions from 008_role_model_rework.sql:
--     get_user_org_id(), is_admin_or_above(), is_business_owner(),
--     is_platform_owner(). Policy shape mirrors warehouse_transfers'
--     "select any org member, write admin_or_above" pattern from
--     002_rls_policies.sql exactly.
--   - Indexes named idx_<table>_<column>, matching existing convention.
-- ============================================================

-- ── Purchase Orders ───────────────────────────────────────────
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'received', 'cancelled')),
  expected_date DATE,
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  sent_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Purchase Order Items ──────────────────────────────────────
-- One row per product line on a PO. quantity_received starts at 0 and
-- is set equal to quantity_ordered when the PO is received (this
-- minimal version only supports receiving a PO in full -- partial
-- receiving is explicitly out of scope -- but the column is modeled
-- as its own field, not just implied by status, so a future partial-
-- receiving feature can build on it without a schema migration).
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0,
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_purchase_orders_org ON purchase_orders(organization_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

CREATE INDEX idx_purchase_order_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_purchase_order_items_product ON purchase_order_items(product_id);

-- ============================================================
-- updated_at TRIGGER (reuses the shared function from 001_initial_schema.sql)
-- ============================================================
CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Any org member (including cashiers) may read a PO -- matches
-- warehouse_transfers' "transfers_select_org" precedent, which is
-- also readable by the whole org, not just admins. Writes are
-- restricted to business_owner/admin (is_admin_or_above()), matching
-- both the sidebar nav gating (business_owner/admin only) and
-- warehouse_transfers' "transfers_insert_admin"/"transfers_update_admin".
CREATE POLICY "purchase_orders_select_org" ON purchase_orders
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "purchase_orders_insert_admin" ON purchase_orders
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "purchase_orders_update_admin" ON purchase_orders
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "purchase_orders_delete_admin" ON purchase_orders
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- Line items are scoped through their parent PO's organization_id,
-- mirroring vendor_transaction_items' "vendor_items_select"/
-- "vendor_items_manage" EXISTS-subquery pattern exactly.
CREATE POLICY "purchase_order_items_select" ON purchase_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
      AND po.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "purchase_order_items_manage" ON purchase_order_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
      AND po.organization_id = get_user_org_id()
      AND is_admin_or_above()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.purchase_order_id
      AND po.organization_id = get_user_org_id()
      AND is_admin_or_above()
    )
  );

COMMENT ON TABLE purchase_orders IS
  'Minimal Purchase Orders feature backing the Business-tier "purchase_orders" subscription flag (see docs/SUBSCRIPTION_SYSTEM.md). Workflow: draft -> sent -> received|cancelled. Receiving updates inventory via the same pattern used by inventory/page.tsx, transfers/page.tsx and vendors/page.tsx -- no new inventory-mutation mechanism. Partial receiving, approval workflows, PDF export and purchasing analytics are explicitly out of scope for this version.';
COMMENT ON TABLE purchase_order_items IS
  'Line items for a purchase_orders row. quantity_received is set to quantity_ordered on full receipt (partial receiving not supported in this version).';
