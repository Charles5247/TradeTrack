// Auto-generated types for Supabase - extend as needed
export type Database = {
  public: {
    Tables: {
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
        Insert: Omit<Database['public']['Tables']['organizations']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['organizations']['Row']>;
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'super_admin' | 'admin' | 'cashier';
          status: 'active' | 'suspended' | 'inactive';
          organization_id: string | null;
          avatar_url: string | null;
          phone: string | null;
          last_login: string | null;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      products: {
        Row: {
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
          status: 'active' | 'inactive' | 'discontinued';
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
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
          payment_method: string;
          payment_status: string;
          status: string;
          notes: string | null;
          receipt_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['sales']['Row'], 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['sales']['Row']>;
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
        };
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'id' | 'updated_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['inventory']['Row']>;
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
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & { id?: string };
        Update: Partial<Database['public']['Tables']['audit_logs']['Row']>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
