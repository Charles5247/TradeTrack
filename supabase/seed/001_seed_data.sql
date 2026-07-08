-- ============================================================
-- TradeTrack - Seed Data
-- ============================================================

-- Subscription Plans
INSERT INTO subscription_plans (id, name, price, currency, max_cashiers, max_products, max_warehouses, features) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Basic', 3000, 'NGN', 1, 500, 2, '["inventory","sales","reports","receipt_printing"]'),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'Standard', 5000, 'NGN', 3, 2000, 5, '["inventory","sales","reports","receipt_printing","daily_summaries","barcode_scanning"]'),
  ('c3d4e5f6-a7b8-9012-cdef-123456789012', 'Business', 8000, 'NGN', -1, -1, -1, '["inventory","sales","reports","receipt_printing","daily_summaries","barcode_scanning","advanced_reports","priority_support","warehouse_transfers","vendor_consignment","audit_trail","multi_language"]');

-- Demo Organization
INSERT INTO organizations (id, name, slug, currency, timezone, subscription_status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Store', 'demo-store', 'NGN', 'Africa/Lagos', 'active');

-- Demo Users (passwords set via Supabase Auth, these are profile records)
INSERT INTO users (id, email, full_name, role, status, organization_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'superadmin@tradetrack.ng', 'Super Admin', 'super_admin', 'active', NULL),
  ('33333333-3333-3333-3333-333333333333', 'admin@demo.com', 'Demo Admin', 'admin', 'active', '11111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444', 'cashier@demo.com', 'Demo Cashier', 'cashier', 'active', '11111111-1111-1111-1111-111111111111');

-- Demo Warehouses
INSERT INTO warehouses (id, organization_id, name, description, is_main) VALUES
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Main Shop', 'Primary retail location', true),
  ('66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 'Warehouse A', 'Storage warehouse A', false),
  ('77777777-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', 'Warehouse B', 'Storage warehouse B', false);

-- Demo Categories
INSERT INTO categories (id, organization_id, name, color) VALUES
  ('88888888-8888-8888-8888-888888888888', '11111111-1111-1111-1111-111111111111', 'Electronics', '#3B82F6'),
  ('99999999-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', 'Clothing', '#10B981'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Food & Beverages', '#F59E0B'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Household', '#8B5CF6');

-- Demo Suppliers
INSERT INTO suppliers (id, organization_id, name, phone, email) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Tech Supplies Ltd', '08012345678', 'supply@techsupplies.ng'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Fashion Hub', '08098765432', 'orders@fashionhub.ng');

-- Demo Products
INSERT INTO products (id, organization_id, name, sku, barcode, selling_price, cost_price, category_id, supplier_id, status, created_by) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', 'Samsung Galaxy A54', 'ELEC-001', '1234567890123', 250000, 200000, '88888888-8888-8888-8888-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', '33333333-3333-3333-3333-333333333333'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '11111111-1111-1111-1111-111111111111', 'Men White T-Shirt', 'CLTH-001', '2345678901234', 8500, 5000, '99999999-9999-9999-9999-999999999999', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'active', '33333333-3333-3333-3333-333333333333'),
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Indomie Noodles (Box)', 'FOOD-001', '3456789012345', 4500, 3200, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'active', '33333333-3333-3333-3333-333333333333'),
  ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bluetooth Earphones', 'ELEC-002', '4567890123456', 15000, 9000, '88888888-8888-8888-8888-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', '33333333-3333-3333-3333-333333333333'),
  ('00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Phone Charger USB-C', 'ELEC-003', '5678901234567', 3500, 1800, '88888888-8888-8888-8888-888888888888', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'active', '33333333-3333-3333-3333-333333333333');

-- Demo Inventory
INSERT INTO inventory (organization_id, product_id, warehouse_id, quantity, min_stock_level) VALUES
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '55555555-5555-5555-5555-555555555555', 15, 3),
  ('11111111-1111-1111-1111-111111111111', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '66666666-6666-6666-6666-666666666666', 30, 5),
  ('11111111-1111-1111-1111-111111111111', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '55555555-5555-5555-5555-555555555555', 4, 10),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 0, 5),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 25, 5),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', 50, 10);

-- Settings
INSERT INTO settings (organization_id, key, value) VALUES
  ('11111111-1111-1111-1111-111111111111', 'tax_rate', '0'),
  ('11111111-1111-1111-1111-111111111111', 'currency', '"NGN"'),
  ('11111111-1111-1111-1111-111111111111', 'receipt_footer', '"Thank you for shopping with us!"'),
  ('11111111-1111-1111-1111-111111111111', 'language', '"en"'),
  ('11111111-1111-1111-1111-111111111111', 'theme', '"light"');
