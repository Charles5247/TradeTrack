// ============================================================
// TradeTrack - Core TypeScript Types
// ============================================================

// ── User & Auth ──────────────────────────────────────────────
export type UserRole = 'super_admin' | 'admin' | 'cashier';

export type UserStatus = 'active' | 'suspended' | 'inactive';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  organization_id: string;
  avatar_url?: string;
  phone?: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  timezone: string;
  subscription_plan_id?: string;
  subscription_status: 'active' | 'expired' | 'trial' | 'suspended';
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

// ── Products ─────────────────────────────────────────────────
export type ProductStatus = 'active' | 'inactive' | 'discontinued';

export interface Product {
  id: string;
  organization_id: string;
  name: string;
  make?: string;
  description?: string;
  image_url?: string;
  sku: string;
  barcode?: string;
  selling_price: number;
  cost_price: number;
  category_id?: string;
  supplier_id?: string;
  status: ProductStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: Category;
  supplier?: Supplier;
  total_quantity?: number;
}

export interface Category {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  color?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at: string;
}

// ── Inventory ────────────────────────────────────────────────
export interface Warehouse {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  address?: string;
  is_main: boolean;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  min_stock_level: number;
  max_stock_level?: number;
  updated_at: string;
  // Joined fields
  product?: Product;
  warehouse?: Warehouse;
}

export type InventoryMovementType = 'in' | 'out' | 'transfer' | 'adjustment' | 'sale' | 'return';

export interface InventoryMovement {
  id: string;
  organization_id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: InventoryMovementType;
  quantity: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  // Joined fields
  product?: Product;
  warehouse?: Warehouse;
  user?: User;
}

// ── Warehouse Transfers ──────────────────────────────────────
export type TransferStatus = 'pending' | 'received' | 'cancelled';

export interface WarehouseTransfer {
  id: string;
  organization_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  product_id: string;
  quantity: number;
  status: TransferStatus;
  notes?: string;
  sent_by: string;
  received_by?: string;
  date_sent: string;
  date_received?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  from_warehouse?: Warehouse;
  to_warehouse?: Warehouse;
  product?: Product;
  sender?: User;
  receiver?: User;
}

// ── Sales ────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'transfer' | 'pos_terminal' | 'split' | 'partial';
export type SaleStatus = 'completed' | 'pending' | 'cancelled' | 'refunded';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface Sale {
  id: string;
  organization_id: string;
  invoice_number: string;
  cashier_id: string;
  warehouse_id: string;
  customer_name?: string;
  customer_phone?: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  change_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: SaleStatus;
  notes?: string;
  receipt_url?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  cashier?: User;
  warehouse?: Warehouse;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount: number;
  total: number;
  created_at: string;
  // Joined fields
  product?: Product;
}

// ── Vendor Consignment ───────────────────────────────────────
export type VendorTransactionStatus = 'pending' | 'completed' | 'cancelled' | 'partial';

export interface VendorTransaction {
  id: string;
  organization_id: string;
  vendor_name: string;
  vendor_phone?: string;
  vendor_email?: string;
  date_issued: string;
  expected_payment_date?: string;
  status: VendorTransactionStatus;
  total_value: number;
  amount_paid: number;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  items?: VendorTransactionItem[];
  creator?: User;
}

export interface VendorTransactionItem {
  id: string;
  vendor_transaction_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
  // Joined fields
  product?: Product;
}

// ── Audit Trail ──────────────────────────────────────────────
export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  reason?: string;
  created_at: string;
  // Joined fields
  user?: User;
}

// ── Notifications ────────────────────────────────────────────
export type NotificationType =
  | 'low_stock'
  | 'out_of_stock'
  | 'pending_payment'
  | 'pending_transfer'
  | 'subscription_expiry'
  | 'sync_completed'
  | 'sync_failed'
  | 'general';

export interface Notification {
  id: string;
  organization_id: string;
  user_id?: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

// ── Subscriptions ────────────────────────────────────────────
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  max_cashiers: number;
  max_products?: number;
  max_warehouses?: number;
  features: string[];
  is_active: boolean;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  starts_at: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  // Joined fields
  plan?: SubscriptionPlan;
}

// ── Offline Sync ─────────────────────────────────────────────
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncQueueItem {
  id: string;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_id: string;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retry_count: number;
  error?: string;
  created_at: string;
  synced_at?: string;
}

// ── Dashboard Analytics ──────────────────────────────────────
export interface DashboardStats {
  today_sales: number;
  today_revenue: number;
  weekly_revenue: number;
  monthly_revenue: number;
  total_products: number;
  low_stock_count: number;
  out_of_stock_count: number;
  pending_vendor_debts: number;
  pending_transfers: number;
}

export interface RevenueChartData {
  date: string;
  revenue: number;
  sales_count: number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  total_sold: number;
  revenue: number;
}

// ── POS Cart ─────────────────────────────────────────────────
export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount: number;
  warehouse_id: string;
}

export interface Cart {
  items: CartItem[];
  discount: number;
  tax_rate: number;
  warehouse_id: string;
  payment_method: PaymentMethod;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
}

// ── Pagination ───────────────────────────────────────────────
export interface PaginationParams {
  page: number;
  limit: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ── API Response ─────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── Filters ──────────────────────────────────────────────────
export interface SalesFilter {
  start_date?: string;
  end_date?: string;
  cashier_id?: string;
  warehouse_id?: string;
  payment_method?: PaymentMethod;
  status?: SaleStatus;
  search?: string;
}

export interface InventoryFilter {
  warehouse_id?: string;
  category_id?: string;
  status?: 'all' | 'low' | 'out';
  search?: string;
}

// ── i18n ─────────────────────────────────────────────────────
export type Locale = 'en' | 'ha' | 'yo' | 'ig' | 'pcm';

export interface Translation {
  [key: string]: string | Translation;
}
