-- ============================================================
-- Migration 005: Add Missing Roles (owner, manager)
-- ============================================================
-- The original schema (001_initial_schema.sql) only allowed
-- 'super_admin', 'admin', 'cashier' roles on the users table.
-- However, migration 004_owner_payments_merchants.sql already
-- defines RLS policies that reference an 'owner' role, and the
-- application's documented role hierarchy
-- (super_admin > owner > admin > manager > cashier) requires
-- 'owner' and 'manager' as well. This migration widens the
-- CHECK constraint so the database, RLS policies, and
-- application code are all aligned on the same 5-tier role
-- model.
-- ============================================================

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'owner', 'manager', 'cashier'));
