import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// ── User Management ───────────────────────────────────────────
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['super_admin', 'admin', 'cashier']),
  phone: z.string().optional(),
  organization_id: z.string().uuid().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().optional(),
  status: z.enum(['active', 'suspended', 'inactive']).optional(),
  role: z.enum(['super_admin', 'admin', 'cashier']).optional(),
});

// ── Products ──────────────────────────────────────────────────
export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  make: z.string().optional(),
  description: z.string().optional(),
  sku: z.string().min(1, 'SKU is required'),
  barcode: z.string().optional(),
  selling_price: z.coerce.number().min(0, 'Price must be a positive number'),
  cost_price: z.coerce.number().min(0, 'Cost price must be a positive number'),
  category_id: z.string().uuid().optional().nullable(),
  supplier_id: z.string().uuid().optional().nullable(),
  status: z.enum(['active', 'inactive', 'discontinued']).default('active'),
});

// ── Category ──────────────────────────────────────────────────
export const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  color: z.string().optional(),
});

// ── Supplier ──────────────────────────────────────────────────
export const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
});

// ── Warehouse ─────────────────────────────────────────────────
export const warehouseSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required'),
  description: z.string().optional(),
  address: z.string().optional(),
  is_main: z.boolean().default(false),
});

// ── Inventory ─────────────────────────────────────────────────
export const inventoryAdjustmentSchema = z.object({
  product_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  quantity: z.coerce.number().int(),
  movement_type: z.enum(['in', 'out', 'adjustment']),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

// ── Warehouse Transfer ────────────────────────────────────────
export const warehouseTransferSchema = z.object({
  from_warehouse_id: z.string().uuid('From warehouse is required'),
  to_warehouse_id: z.string().uuid('To warehouse is required'),
  product_id: z.string().uuid('Product is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional(),
}).refine((data) => data.from_warehouse_id !== data.to_warehouse_id, {
  message: 'From and To warehouses must be different',
  path: ['to_warehouse_id'],
});

// ── Sale ──────────────────────────────────────────────────────
export const saleSchema = z.object({
  warehouse_id: z.string().uuid('Warehouse is required'),
  customer_name: z.string().optional(),
  customer_phone: z.string().optional(),
  payment_method: z.enum(['cash', 'transfer', 'pos_terminal', 'split', 'partial']),
  amount_paid: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1),
    unit_price: z.coerce.number().min(0),
    discount: z.coerce.number().min(0).default(0),
    warehouse_id: z.string().uuid(),
  })).min(1, 'At least one item is required'),
});

// ── Vendor Transaction ────────────────────────────────────────
export const vendorTransactionSchema = z.object({
  vendor_name: z.string().min(1, 'Vendor name is required'),
  vendor_phone: z.string().optional(),
  vendor_email: z.string().email().optional().or(z.literal('')),
  date_issued: z.string(),
  expected_payment_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().min(1),
    unit_price: z.coerce.number().min(0),
  })).min(1, 'At least one item is required'),
});

// ── Organization ──────────────────────────────────────────────
export const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  currency: z.string().default('NGN'),
  timezone: z.string().default('Africa/Lagos'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type CreateUserFormData = z.infer<typeof createUserSchema>;
export type UpdateUserFormData = z.infer<typeof updateUserSchema>;
export type ProductFormData = z.infer<typeof productSchema>;
export type CategoryFormData = z.infer<typeof categorySchema>;
export type SupplierFormData = z.infer<typeof supplierSchema>;
export type WarehouseFormData = z.infer<typeof warehouseSchema>;
export type InventoryAdjustmentFormData = z.infer<typeof inventoryAdjustmentSchema>;
export type WarehouseTransferFormData = z.infer<typeof warehouseTransferSchema>;
export type SaleFormData = z.infer<typeof saleSchema>;
export type VendorTransactionFormData = z.infer<typeof vendorTransactionSchema>;
export type OrganizationFormData = z.infer<typeof organizationSchema>;
