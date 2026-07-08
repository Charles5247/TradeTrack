-- ============================================================
-- TradeTrack - Row Level Security Policies
-- Migration: 002_rls_policies.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Helper Functions ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin' FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('super_admin','admin') FROM users WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── Organizations ─────────────────────────────────────────────
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (
    id = get_user_org_id() OR is_super_admin()
  );

CREATE POLICY "org_insert" ON organizations
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (
    id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Users ─────────────────────────────────────────────────────
CREATE POLICY "users_select_own_org" ON users
  FOR SELECT USING (
    organization_id = get_user_org_id() OR is_super_admin()
  );

CREATE POLICY "users_insert_super_admin" ON users
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "users_update_admin" ON users
  FOR UPDATE USING (
    (organization_id = get_user_org_id() AND is_admin_or_above())
    OR is_super_admin()
    OR id = auth.uid()
  );

CREATE POLICY "users_delete_super_admin" ON users
  FOR DELETE USING (is_super_admin());

-- ── Products ──────────────────────────────────────────────────
CREATE POLICY "products_select_org" ON products
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "products_insert_admin" ON products
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "products_update_admin" ON products
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "products_delete_admin" ON products
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Categories ────────────────────────────────────────────────
CREATE POLICY "categories_select_org" ON categories
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "categories_insert_admin" ON categories
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "categories_update_admin" ON categories
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "categories_delete_admin" ON categories
  FOR DELETE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Suppliers ─────────────────────────────────────────────────
CREATE POLICY "suppliers_select_org" ON suppliers
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "suppliers_manage_admin" ON suppliers
  FOR ALL USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Warehouses ────────────────────────────────────────────────
CREATE POLICY "warehouses_select_org" ON warehouses
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "warehouses_manage_admin" ON warehouses
  FOR ALL USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Inventory ─────────────────────────────────────────────────
CREATE POLICY "inventory_select_org" ON inventory
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "inventory_manage_admin" ON inventory
  FOR ALL USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Inventory Movements ───────────────────────────────────────
CREATE POLICY "inv_movements_select_org" ON inventory_movements
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "inv_movements_insert_all" ON inventory_movements
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ── Warehouse Transfers ───────────────────────────────────────
CREATE POLICY "transfers_select_org" ON warehouse_transfers
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "transfers_insert_admin" ON warehouse_transfers
  FOR INSERT WITH CHECK (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "transfers_update_admin" ON warehouse_transfers
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Sales ─────────────────────────────────────────────────────
CREATE POLICY "sales_select_org" ON sales
  FOR SELECT USING (
    organization_id = get_user_org_id() AND (
      is_admin_or_above() OR cashier_id = auth.uid()
    )
  );

CREATE POLICY "sales_insert_all" ON sales
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

CREATE POLICY "sales_update_admin" ON sales
  FOR UPDATE USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Sale Items ────────────────────────────────────────────────
CREATE POLICY "sale_items_select" ON sale_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_items.sale_id
      AND s.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "sale_items_insert" ON sale_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales s
      WHERE s.id = sale_items.sale_id
      AND s.organization_id = get_user_org_id()
    )
  );

-- ── Customers ─────────────────────────────────────────────────
CREATE POLICY "customers_select_org" ON customers
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "customers_manage_all" ON customers
  FOR ALL USING (organization_id = get_user_org_id());

-- ── Vendor Transactions ───────────────────────────────────────
CREATE POLICY "vendors_select_org" ON vendor_transactions
  FOR SELECT USING (organization_id = get_user_org_id());

CREATE POLICY "vendors_manage_admin" ON vendor_transactions
  FOR ALL USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Vendor Transaction Items ──────────────────────────────────
CREATE POLICY "vendor_items_select" ON vendor_transaction_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM vendor_transactions vt
      WHERE vt.id = vendor_transaction_items.vendor_transaction_id
      AND vt.organization_id = get_user_org_id()
    )
  );

CREATE POLICY "vendor_items_manage" ON vendor_transaction_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM vendor_transactions vt
      WHERE vt.id = vendor_transaction_items.vendor_transaction_id
      AND vt.organization_id = get_user_org_id()
    )
  );

-- ── Audit Logs ────────────────────────────────────────────────
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "audit_insert_all" ON audit_logs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ── Notifications ─────────────────────────────────────────────
CREATE POLICY "notifications_select_user" ON notifications
  FOR SELECT USING (
    organization_id = get_user_org_id()
    AND (user_id = auth.uid() OR user_id IS NULL OR is_admin_or_above())
  );

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    organization_id = get_user_org_id()
    AND (user_id = auth.uid() OR is_admin_or_above())
  );

CREATE POLICY "notifications_insert_system" ON notifications
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ── Settings ──────────────────────────────────────────────────
CREATE POLICY "settings_select_admin" ON settings
  FOR SELECT USING (
    organization_id = get_user_org_id()
  );

CREATE POLICY "settings_manage_admin" ON settings
  FOR ALL USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

-- ── Activity Logs ─────────────────────────────────────────────
CREATE POLICY "activity_select_admin" ON activity_logs
  FOR SELECT USING (
    organization_id = get_user_org_id() AND is_admin_or_above()
  );

CREATE POLICY "activity_insert_all" ON activity_logs
  FOR INSERT WITH CHECK (organization_id = get_user_org_id());

-- ── Subscription Plans ────────────────────────────────────────
CREATE POLICY "plans_select_all" ON subscription_plans
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "plans_manage_super_admin" ON subscription_plans
  FOR ALL USING (is_super_admin());

-- ── Subscriptions ─────────────────────────────────────────────
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    organization_id = get_user_org_id() OR is_super_admin()
  );

CREATE POLICY "subscriptions_manage_super_admin" ON subscriptions
  FOR ALL USING (is_super_admin());
