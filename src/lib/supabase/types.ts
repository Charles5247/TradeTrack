// TracKasuwa – Supabase Database Types
// Generated from migrations/001_initial_schema.sql + 003_payment_and_improvements.sql
import type { IntakeReceipt } from '@/lib/stock-intake/contracts';

export type PaymentMethod =
  | "cash"
  | "transfer"
  | "pos_terminal"
  | "split"
  | "partial";

type NoRel = { Relationships: [] };

export type Database = {
  public: {
    Tables: {
      stock_intakes: { Row: {[K in keyof Omit<IntakeReceipt,'current_stock'|'stock_warning'>]:IntakeReceipt[K]}; Insert: Record<string,never>; Update: Record<string,never>; Relationships: [] };
      import_batches: {
        Row: {id:string;organization_id:string;kind:string;summary:unknown;created_by:string;created_at:string};
        Insert: {id:string;organization_id:string;kind:string;summary?:unknown;created_by:string;created_at?:string};
        Update: Partial<Database['public']['Tables']['import_batches']['Insert']>;
        Relationships: [];
      };
      supplier_products: {
        Row: { id: string; organization_id: string; supplier_id: string; product_id: string; created_at: string };
        Insert: { id?: string; organization_id: string; supplier_id: string; product_id: string; created_at?: string };
        Update: { supplier_id?: string; product_id?: string };
        Relationships: [];
      };
      warehouse_staff: {
        Row: { id: string; organization_id: string; warehouse_id: string; user_id: string; assignment_role: 'manager' | 'cashier'; created_at: string };
        Insert: { id?: string; organization_id: string; warehouse_id: string; user_id: string; assignment_role: 'manager' | 'cashier'; created_at?: string };
        Update: { assignment_role?: 'manager' | 'cashier' };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          currency: string;
          timezone: string;
          subscription_plan_id: string | null;
          subscription_status: string;
          subscription_expires_at: string | null;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          currency?: string;
          timezone?: string;
          subscription_plan_id?: string | null;
          subscription_status?: string;
          subscription_expires_at?: string | null;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["organizations"]["Insert"]
        >;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: "platform_owner" | "business_owner" | "admin" | "cashier";
          status: "active" | "suspended" | "inactive";
          organization_id: string | null;
          avatar_url: string | null;
          phone: string | null;
          last_login: string | null;
          must_change_password: boolean;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          role: "platform_owner" | "business_owner" | "admin" | "cashier";
          status?: "active" | "suspended" | "inactive";
          organization_id?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          last_login?: string | null;
          must_change_password?: boolean;
          settings?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          color: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          color?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Insert"]>;
        Relationships: [];
      };
      products: {
        Row: {
          medical_stock_managed: boolean;
          stock_unit: string;
          variant_size: string | null;
          variant_colour: string | null;
          model: string | null;
          id: string;
          organization_id: string;
          name: string;
          make: string | null;
          description: string | null;
          image_url: string | null;
          sku: string;
          barcode: string | null;
          selling_price: number;
          cost_price: number;
          category_id: string | null;
          supplier_id: string | null;
          status: "active" | "inactive" | "discontinued";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          stock_unit?: string;
          medical_stock_managed?: boolean;
          variant_size?: string | null;
          variant_colour?: string | null;
          model?: string | null;
          id?: string;
          organization_id: string;
          name: string;
          make?: string | null;
          description?: string | null;
          image_url?: string | null;
          sku: string;
          barcode?: string | null;
          selling_price: number;
          cost_price: number;
          category_id?: string | null;
          supplier_id?: string | null;
          status?: "active" | "inactive" | "discontinued";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [];
      };
      warehouses: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          address: string | null;
          is_main: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          address?: string | null;
          is_main?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["warehouses"]["Insert"]>;
        Relationships: [];
      };
      inventory: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          min_stock_level: number;
          max_stock_level: number | null;
          updated_at: string;
          original_device_timestamp: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          warehouse_id: string;
          quantity?: number;
          min_stock_level?: number;
          max_stock_level?: number | null;
          updated_at?: string;
          original_device_timestamp?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["inventory"]["Insert"]>;
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          warehouse_id: string;
          movement_type:
            | "in"
            | "out"
            | "transfer"
            | "adjustment"
            | "sale"
            | "return";
          quantity: number;
          reference_id: string | null;
          reference_type: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          warehouse_id: string;
          movement_type:
            | "in"
            | "out"
            | "transfer"
            | "adjustment"
            | "sale"
            | "return";
          quantity: number;
          reference_id?: string | null;
          reference_type?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_movements"]["Insert"]
        >;
        Relationships: [];
      };
      warehouse_transfers: {
        Row: {
          id: string;
          organization_id: string;
          from_warehouse_id: string;
          to_warehouse_id: string;
          product_id: string;
          quantity: number;
          status: "pending" | "received" | "cancelled";
          notes: string | null;
          sent_by: string;
          received_by: string | null;
          initiated_by: string | null;
          approved_by: string | null;
          coordinated_by: string | null;
          date_sent: string;
          date_received: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          from_warehouse_id: string;
          to_warehouse_id: string;
          product_id: string;
          quantity: number;
          status?: "pending" | "received" | "cancelled";
          notes?: string | null;
          sent_by: string;
          received_by?: string | null;
          initiated_by?: string | null;
          approved_by?: string | null;
          coordinated_by?: string | null;
          date_sent?: string;
          date_received?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["warehouse_transfers"]["Insert"]
        >;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          supplier_id: string;
          status: "draft" | "sent" | "received" | "cancelled";
          expected_date: string | null;
          total_value: number;
          notes: string | null;
          created_by: string;
          sent_at: string | null;
          received_by: string | null;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          supplier_id: string;
          status?: "draft" | "sent" | "received" | "cancelled";
          expected_date?: string | null;
          total_value?: number;
          notes?: string | null;
          created_by: string;
          sent_at?: string | null;
          received_by?: string | null;
          received_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["purchase_orders"]["Insert"]
        >;
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          purchase_order_id: string;
          product_id: string;
          quantity_ordered: number;
          quantity_received: number;
          unit_cost: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_order_id: string;
          product_id: string;
          quantity_ordered: number;
          quantity_received?: number;
          unit_cost?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["purchase_order_items"]["Insert"]
        >;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          organization_id: string;
          invoice_number: string;
          cashier_id: string;
          warehouse_id: string;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          subtotal: number;
          discount: number;
          tax: number;
          total: number;
          amount_paid: number;
          change_amount: number;
          payment_method: PaymentMethod;
          payment_status: "paid" | "partial" | "unpaid";
          status: "completed" | "pending" | "cancelled" | "refunded";
          notes: string | null;
          receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          invoice_number: string;
          cashier_id: string;
          warehouse_id: string;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          subtotal?: number;
          discount?: number;
          tax?: number;
          total: number;
          amount_paid: number;
          change_amount?: number;
          payment_method: PaymentMethod;
          payment_status?: "paid" | "partial" | "unpaid";
          status?: "completed" | "pending" | "cancelled" | "refunded";
          notes?: string | null;
          receipt_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Insert"]>;
        Relationships: [];
      };
      sale_items: {
        Row: {
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
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          unit_price: number;
          cost_price?: number;
          discount?: number;
          total: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_items"]["Insert"]>;
        Relationships: [];
      };
      vendor_transactions: {
        Row: {
          id: string;
          organization_id: string;
          vendor_name: string;
          vendor_phone: string | null;
          vendor_email: string | null;
          date_issued: string;
          expected_payment_date: string | null;
          status: "pending" | "completed" | "cancelled" | "partial";
          total_value: number;
          amount_paid: number;
          payment_method: "cash" | "transfer" | "pos" | null;
          receipt_url: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_name: string;
          vendor_phone?: string | null;
          vendor_email?: string | null;
          date_issued?: string;
          expected_payment_date?: string | null;
          status?: "pending" | "completed" | "cancelled" | "partial";
          total_value?: number;
          amount_paid?: number;
          payment_method?: "cash" | "transfer" | "pos" | null;
          receipt_url?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["vendor_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      vendor_transaction_items: {
        Row: {
          id: string;
          vendor_transaction_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_transaction_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          total: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["vendor_transaction_items"]["Insert"]
        >;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          old_values: Record<string, unknown> | null;
          new_values: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          old_values?: Record<string, unknown> | null;
          new_values?: Record<string, unknown> | null;
          ip_address?: string | null;
          user_agent?: string | null;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          type: string;
          title: string;
          message: string;
          data: Record<string, unknown>;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          type: string;
          title: string;
          message: string;
          data?: Record<string, unknown>;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["notifications"]["Insert"]
        >;
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          value: unknown;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          value: unknown;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      offline_sync_queue: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          table_name: string;
          operation: "INSERT" | "UPDATE" | "DELETE";
          record_id: string;
          payload: Record<string, unknown>;
          status: "pending" | "syncing" | "synced" | "failed";
          retry_count: number;
          error: string | null;
          created_at: string;
          synced_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          table_name: string;
          operation: "INSERT" | "UPDATE" | "DELETE";
          record_id: string;
          payload: Record<string, unknown>;
          status?: "pending" | "syncing" | "synced" | "failed";
          retry_count?: number;
          error?: string | null;
          created_at?: string;
          synced_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["offline_sync_queue"]["Insert"]
        >;
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          activity_type: string;
          description: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          activity_type: string;
          description: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["activity_logs"]["Insert"]
        >;
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          price: number;
          currency: string;
          billing_cycle: string;
          max_cashiers: number;
          max_products: number | null;
          max_warehouses: number | null;
          features: string[];
          is_active: boolean;
          is_popular: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price: number;
          currency?: string;
          billing_cycle?: string;
          max_cashiers: number;
          max_products?: number | null;
          max_warehouses?: number | null;
          features?: string[];
          is_active?: boolean;
          is_popular?: boolean | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["subscription_plans"]["Insert"]
        >;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          plan_id: string;
          status: "active" | "expired" | "cancelled" | "trial";
          starts_at: string;
          expires_at: string;
          created_by: string | null;
          created_at: string;
          auto_renew: boolean | null;
          payment_reference: string | null;
          billing_cycle: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          plan_id: string;
          status?: "active" | "expired" | "cancelled" | "trial";
          starts_at: string;
          expires_at: string;
          created_by?: string | null;
          created_at?: string;
          auto_renew?: boolean | null;
          payment_reference?: string | null;
          billing_cycle?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["subscriptions"]["Insert"]
        >;
        Relationships: [];
      };
      payment_transactions: {
        Row: {
          id: string;
          organization_id: string;
          subscription_id: string | null;
          amount: number;
          currency: string;
          status: "pending" | "success" | "failed" | "refunded";
          payment_method: string;
          provider: string;
          provider_reference: string | null;
          provider_response: Record<string, unknown> | null;
          plan_id: string | null;
          plan_name: string | null;
          initiated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          subscription_id?: string | null;
          amount: number;
          currency?: string;
          status?: "pending" | "success" | "failed" | "refunded";
          payment_method?: string;
          provider?: string;
          provider_reference?: string | null;
          provider_response?: Record<string, unknown> | null;
          plan_id?: string | null;
          plan_name?: string | null;
          initiated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["payment_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          id: string;
          provider: string;
          event_type: string;
          payload: Record<string, unknown>;
          processed: boolean;
          processing_error: string | null;
          idempotency_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          event_type: string;
          payload: Record<string, unknown>;
          processed?: boolean;
          processing_error?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_logs"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          subscription_id: string | null;
          payment_transaction_id: string | null;
          invoice_number: string;
          amount: number;
          currency: string;
          status: "paid" | "unpaid" | "cancelled";
          due_date: string | null;
          paid_at: string | null;
          pdf_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          subscription_id?: string | null;
          payment_transaction_id?: string | null;
          invoice_number?: string;
          amount: number;
          currency?: string;
          status?: "paid" | "unpaid" | "cancelled";
          due_date?: string | null;
          paid_at?: string | null;
          pdf_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      merchants: {
        Row: {
          id: string;
          organization_id: string;
          business_name: string;
          business_type: string | null;
          registration_number: string | null;
          tax_id: string | null;
          status: "pending" | "active" | "suspended" | "deactivated";
          verification_status:
            | "unverified"
            | "pending"
            | "verified"
            | "rejected";
          contact_name: string;
          contact_email: string;
          contact_phone: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          country: string;
          logo_url: string | null;
          onboarding_completed: boolean;
          onboarding_step: number;
          subscription_plan_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          business_name: string;
          business_type?: string | null;
          registration_number?: string | null;
          tax_id?: string | null;
          status?: "pending" | "active" | "suspended" | "deactivated";
          verification_status?:
            | "unverified"
            | "pending"
            | "verified"
            | "rejected";
          contact_name: string;
          contact_email: string;
          contact_phone?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string;
          logo_url?: string | null;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          subscription_plan_id?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["merchants"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      read_stock_intake_batch: { Args: { target_id?: string | null; row_offset?: number; group_offset?: number; target_source?: string | null; review_only?: boolean; issue_filter?: string; selection_kind?: string | null }; Returns: unknown };
      stock_intake_batch_command: { Args: { command: unknown }; Returns: unknown };
      stock_intake_job_command: { Args: { command: unknown }; Returns: unknown };
      save_stock_intake: {Args:{receipt_id:string;expected_revision:number;receipt_document:unknown};Returns:unknown};
      approve_stock_intake: {Args:{receipt_id:string;expected_revision:number;expected_hash:string};Returns:unknown};
      post_stock_intake: {Args:{receipt_id:string;approval_id:string};Returns:unknown};
      complete_warehouse_transfer: { Args: {transfer_id: string; target_status: string}; Returns: unknown };
      apply_import_chunk: {Args:{batch:string;import_rows:unknown;duplicate_mode:string;warehouse:string|null};Returns:unknown};
      apply_inventory_adjustment: { Args: {command: unknown}; Returns: unknown };
      post_pos_checkout: {
        Args: { command: unknown; reconcile_legacy?: boolean; recovery_reason?: string | null };
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
};

// Suppress unused import warning
export type { NoRel };
