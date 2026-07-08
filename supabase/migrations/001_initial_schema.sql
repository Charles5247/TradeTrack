-- ============================================================
-- TradeTrack - Initial Database Schema
-- Migration: 001_initial_schema.sql
-- ============================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Organizations ─────────────────────────────────────────────
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  logo_url TEXT,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  currency VARCHAR(10) DEFAULT 'NGN',
  timezone VARCHAR(50) DEFAULT 'Africa/Lagos',
  subscription_plan_id UUID,
  subscription_status VARCHAR(20) DEFAULT 'trial' CHECK (subscription_status IN ('active','expired','trial','suspended')),
  subscription_expires_at TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Subscription Plans ────────────────────────────────────────
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'NGN',
  max_cashiers INTEGER NOT NULL,
  max_products INTEGER,
  max_warehouses INTEGER,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Subscriptions ─────────────────────────────────────────────
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','trial')),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin','admin','cashier')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','suspended','inactive')),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  avatar_url TEXT,
  phone VARCHAR(20),
  last_login TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Categories ────────────────────────────────────────────────
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Suppliers ─────────────────────────────────────────────────
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Products ──────────────────────────────────────────────────
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  make VARCHAR(100),
  description TEXT,
  image_url TEXT,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100),
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','discontinued')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, sku)
);

-- ── Warehouses ────────────────────────────────────────────────
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address TEXT,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Inventory ─────────────────────────────────────────────────
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, warehouse_id)
);

-- ── Inventory Movements ───────────────────────────────────────
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in','out','transfer','adjustment','sale','return')),
  quantity INTEGER NOT NULL,
  reference_id UUID,
  reference_type VARCHAR(50),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Warehouse Transfers ───────────────────────────────────────
CREATE TABLE warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','received','cancelled')),
  notes TEXT,
  sent_by UUID NOT NULL REFERENCES users(id),
  received_by UUID REFERENCES users(id),
  date_sent TIMESTAMPTZ DEFAULT NOW(),
  date_received TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Customers ─────────────────────────────────────────────────
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sales ─────────────────────────────────────────────────────
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  cashier_id UUID NOT NULL REFERENCES users(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(20),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  change_amount DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash','transfer','pos_terminal','split','partial')),
  payment_status VARCHAR(20) DEFAULT 'paid' CHECK (payment_status IN ('paid','partial','unpaid')),
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed','pending','cancelled','refunded')),
  notes TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, invoice_number)
);

-- ── Sale Items ────────────────────────────────────────────────
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vendor Transactions ───────────────────────────────────────
CREATE TABLE vendor_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_name VARCHAR(255) NOT NULL,
  vendor_phone VARCHAR(20),
  vendor_email VARCHAR(255),
  date_issued TIMESTAMPTZ DEFAULT NOW(),
  expected_payment_date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled','partial')),
  total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vendor Transaction Items ──────────────────────────────────
CREATE TABLE vendor_transaction_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_transaction_id UUID NOT NULL REFERENCES vendor_transactions(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Audit Logs ────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Settings ──────────────────────────────────────────────────
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, key)
);

-- ── Offline Sync Queue ────────────────────────────────────────
CREATE TABLE offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL,
  user_id UUID NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  record_id UUID NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','syncing','synced','failed')),
  retry_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- ── Activity Logs ─────────────────────────────────────────────
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  activity_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for Performance
-- ============================================================
CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_status ON products(status);

CREATE INDEX idx_inventory_org ON inventory(organization_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON inventory(warehouse_id);

CREATE INDEX idx_inventory_movements_org ON inventory_movements(organization_id);
CREATE INDEX idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_date ON inventory_movements(created_at);

CREATE INDEX idx_sales_org ON sales(organization_id);
CREATE INDEX idx_sales_cashier ON sales(cashier_id);
CREATE INDEX idx_sales_warehouse ON sales(warehouse_id);
CREATE INDEX idx_sales_date ON sales(created_at);
CREATE INDEX idx_sales_invoice ON sales(invoice_number);
CREATE INDEX idx_sales_status ON sales(status);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at);

CREATE INDEX idx_vendor_transactions_org ON vendor_transactions(organization_id);
CREATE INDEX idx_vendor_transactions_status ON vendor_transactions(status);

CREATE INDEX idx_warehouse_transfers_org ON warehouse_transfers(organization_id);
CREATE INDEX idx_warehouse_transfers_status ON warehouse_transfers(status);

CREATE INDEX idx_notifications_org ON notifications(organization_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

CREATE INDEX idx_offline_sync_status ON offline_sync_queue(status);
CREATE INDEX idx_offline_sync_user ON offline_sync_queue(user_id);

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_updated_at BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendor_transactions_updated_at BEFORE UPDATE ON vendor_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_warehouse_transfers_updated_at BEFORE UPDATE ON warehouse_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- INVOICE NUMBER SEQUENCE
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1000;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'INV-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;
