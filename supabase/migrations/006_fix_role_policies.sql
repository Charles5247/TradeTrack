-- ============================================================
-- Migration 006: Re-affirm 5-tier RBAC in RLS policies
-- ============================================================
-- NOTE: This migration was originally authored (in a separate,
-- parallel development session) under the assumption that the
-- `users.role` CHECK constraint only allows 'super_admin',
-- 'admin', 'cashier' (a 3-tier model), and it dropped/recreated
-- the merchants/webhook_logs/invoices/merchant_device_limits
-- policies WITHOUT the 'owner' role.
--
-- However, migration 004_owner_payments_merchants.sql already
-- defines these same policies WITH 'owner' included, and
-- migration 005_add_missing_roles.sql widens the CHECK
-- constraint to the documented 5-tier hierarchy:
--   super_admin > owner > admin > manager > cashier
--
-- This migration has been corrected (during merge conflict
-- resolution) to re-create the same policies while PRESERVING
-- 'owner' access, so that org owners keep platform-wide
-- visibility over merchants/invoices/webhook_logs/device
-- limits, consistent with 004 and the application's RBAC model.
-- Functionally this migration is now a safe no-op re-assertion
-- of 004's policies (DROP + CREATE the same definitions), kept
-- for history/idempotency rather than to change behavior.
-- ============================================================

-- Merchants policies
DROP POLICY IF EXISTS "merchants_select_own_org" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_owner" ON public.merchants;
DROP POLICY IF EXISTS "merchants_insert_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_update_admin" ON public.merchants;
DROP POLICY IF EXISTS "merchants_delete_super_admin" ON public.merchants;

CREATE POLICY "merchants_select_own_org" ON public.merchants
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
    )
  );

CREATE POLICY "merchants_insert_admin" ON public.merchants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'super_admin', 'admin')
    )
  );

CREATE POLICY "merchants_update_admin" ON public.merchants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'super_admin', 'admin')
    )
  );

CREATE POLICY "merchants_delete_super_admin" ON public.merchants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
    )
  );

-- Webhook logs
DROP POLICY IF EXISTS "webhook_logs_select_admin" ON public.webhook_logs;

CREATE POLICY "webhook_logs_select_admin" ON public.webhook_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'super_admin', 'admin')
    )
  );

-- Invoices
DROP POLICY IF EXISTS "invoices_select_own_org" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_service" ON public.invoices;
DROP POLICY IF EXISTS "invoices_update_admin" ON public.invoices;

CREATE POLICY "invoices_select_own_org" ON public.invoices
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
    )
  );

CREATE POLICY "invoices_update_admin" ON public.invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('owner', 'super_admin', 'admin')
    )
  );

-- Merchant device limits
DROP POLICY IF EXISTS "device_limits_own_org" ON public.merchant_device_limits;

CREATE POLICY "device_limits_own_org" ON public.merchant_device_limits
  FOR ALL USING (
    merchant_id IN (
      SELECT m.id FROM public.merchants m
      JOIN public.users u ON u.organization_id = m.organization_id
      WHERE u.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('owner', 'super_admin')
    )
  );
