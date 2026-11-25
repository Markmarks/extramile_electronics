/**
 * Database types for the schema in docs/02-DATA-MODEL.md (migrations 001–008).
 *
 * Hand-written to match the migrations because no local Supabase/Docker is available
 * to run `supabase gen types typescript --local`. Keep in sync with supabase/migrations.
 * Shape mirrors the Supabase generator so `supabase gen types` can later overwrite it.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          phone: string | null;
          role: Database['public']['Enums']['user_role'];
          marketing_opt_in: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          marketing_opt_in?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          marketing_opt_in?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          recipient: string;
          phone: string;
          line1: string;
          line2: string | null;
          city: string;
          region: string;
          landmark: string | null;
          zone_id: string | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          recipient: string;
          phone: string;
          line1: string;
          line2?: string | null;
          city: string;
          region: string;
          landmark?: string | null;
          zone_id?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          label?: string | null;
          recipient?: string;
          phone?: string;
          line1?: string;
          line2?: string | null;
          city?: string;
          region?: string;
          landmark?: string | null;
          zone_id?: string | null;
          is_default?: boolean;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          spec_schema: Json;
          sort_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          spec_schema?: Json;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          parent_id?: string | null;
          name?: string;
          slug?: string;
          spec_schema?: Json;
          sort_order?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      brands: {
        Row: { id: string; name: string; slug: string; logo_path: string | null };
        Insert: { id?: string; name: string; slug: string; logo_path?: string | null };
        Update: { name?: string; slug?: string; logo_path?: string | null };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string;
          brand_id: string;
          title: string;
          slug: string;
          model: string | null;
          description: string | null;
          specs: Json;
          condition: Database['public']['Enums']['product_cond'];
          warranty_months: number;
          warranty_provider: string | null;
          is_active: boolean;
          rating_avg: number;
          rating_count: number;
          search_tsv: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          brand_id: string;
          title: string;
          slug: string;
          model?: string | null;
          description?: string | null;
          specs?: Json;
          condition?: Database['public']['Enums']['product_cond'];
          warranty_months?: number;
          warranty_provider?: string | null;
          is_active?: boolean;
          rating_avg?: number;
          rating_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          brand_id?: string;
          title?: string;
          slug?: string;
          model?: string | null;
          description?: string | null;
          specs?: Json;
          condition?: Database['public']['Enums']['product_cond'];
          warranty_months?: number;
          warranty_provider?: string | null;
          is_active?: boolean;
          rating_avg?: number;
          rating_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          sku: string;
          attrs: Json;
          price: number;
          compare_at_price: number | null;
          stock: number;
          reserved: number;
          weight_grams: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          sku: string;
          attrs?: Json;
          price: number;
          compare_at_price?: number | null;
          stock?: number;
          reserved?: number;
          weight_grams?: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          product_id?: string;
          sku?: string;
          attrs?: Json;
          price?: number;
          compare_at_price?: number | null;
          stock?: number;
          reserved?: number;
          weight_grams?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string | null;
          storage_path: string;
          alt: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id?: string | null;
          storage_path: string;
          alt?: string | null;
          sort_order?: number;
        };
        Update: {
          product_id?: string;
          variant_id?: string | null;
          storage_path?: string;
          alt?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          id: number;
          variant_id: string;
          delta: number;
          reason: string;
          order_id: string | null;
          actor: string | null;
          created_at: string;
          unit_cost: number | null;
          supplier: string | null;
        };
        Insert: {
          id?: number;
          variant_id: string;
          delta: number;
          reason: string;
          order_id?: string | null;
          actor?: string | null;
          created_at?: string;
          unit_cost?: number | null;
          supplier?: string | null;
        };
        Update: {
          variant_id?: string;
          delta?: number;
          reason?: string;
          order_id?: string | null;
          actor?: string | null;
          unit_cost?: number | null;
          supplier?: string | null;
        };
        Relationships: [];
      };
      shipping_zones: {
        Row: {
          id: string;
          name: string;
          base_fee: number;
          free_over: number | null;
          eta_days_min: number;
          eta_days_max: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          base_fee: number;
          free_over?: number | null;
          eta_days_min?: number;
          eta_days_max?: number;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          base_fee?: number;
          free_over?: number | null;
          eta_days_min?: number;
          eta_days_max?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          kind: Database['public']['Enums']['coupon_kind'];
          value: number;
          min_subtotal: number;
          max_redemptions: number | null;
          per_user_limit: number;
          redemption_count: number;
          starts_at: string | null;
          ends_at: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          kind: Database['public']['Enums']['coupon_kind'];
          value?: number;
          min_subtotal?: number;
          max_redemptions?: number | null;
          per_user_limit?: number;
          redemption_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
        };
        Update: {
          code?: string;
          kind?: Database['public']['Enums']['coupon_kind'];
          value?: number;
          min_subtotal?: number;
          max_redemptions?: number | null;
          per_user_limit?: number;
          redemption_count?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      coupon_redemptions: {
        Row: {
          id: number;
          coupon_id: string;
          user_id: string | null;
          order_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          coupon_id: string;
          user_id?: string | null;
          order_id: string;
          created_at?: string;
        };
        Update: { coupon_id?: string; user_id?: string | null; order_id?: string };
        Relationships: [];
      };
      carts: {
        Row: {
          id: string;
          user_id: string | null;
          token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string | null;
          token?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          variant_id: string;
          qty: number;
          added_price: number;
        };
        Insert: {
          id?: string;
          cart_id: string;
          variant_id: string;
          qty: number;
          added_price: number;
        };
        Update: { cart_id?: string; variant_id?: string; qty?: number; added_price?: number };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          email: string;
          phone: string;
          status: Database['public']['Enums']['order_status'];
          payment_status: Database['public']['Enums']['payment_status'];
          subtotal: number;
          shipping_fee: number;
          discount: number;
          tax: number;
          total: number;
          currency: string;
          coupon_code: string | null;
          ship_to: Json;
          zone_id: string | null;
          reserved_until: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          channel: Database['public']['Enums']['order_channel'];
        };
        Insert: {
          id?: string;
          order_number: string;
          user_id?: string | null;
          email: string;
          phone: string;
          status?: Database['public']['Enums']['order_status'];
          payment_status?: Database['public']['Enums']['payment_status'];
          subtotal: number;
          shipping_fee?: number;
          discount?: number;
          tax?: number;
          total: number;
          currency?: string;
          coupon_code?: string | null;
          ship_to: Json;
          zone_id?: string | null;
          reserved_until?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          channel?: Database['public']['Enums']['order_channel'];
        };
        Update: {
          status?: Database['public']['Enums']['order_status'];
          payment_status?: Database['public']['Enums']['payment_status'];
          reserved_until?: string | null;
          notes?: string | null;
          updated_at?: string;
          channel?: Database['public']['Enums']['order_channel'];
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string | null;
          sku: string;
          title: string;
          attrs: Json;
          unit_price: number;
          qty: number;
          line_total: number;
          warranty_months: number;
          serials: string[];
        };
        Insert: {
          id?: string;
          order_id: string;
          variant_id?: string | null;
          sku: string;
          title: string;
          attrs?: Json;
          unit_price: number;
          qty: number;
          line_total: number;
          warranty_months?: number;
          serials?: string[];
        };
        Update: { serials?: string[]; warranty_months?: number };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          provider: Database['public']['Enums']['pay_provider'];
          reference: string;
          provider_txn_id: string | null;
          channel: string | null;
          amount: number;
          currency: string;
          status: string;
          authorization: Json | null;
          raw: Json | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          provider?: Database['public']['Enums']['pay_provider'];
          reference: string;
          provider_txn_id?: string | null;
          channel?: string | null;
          amount: number;
          currency?: string;
          status?: string;
          authorization?: Json | null;
          raw?: Json | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          provider_txn_id?: string | null;
          channel?: string | null;
          status?: string;
          authorization?: Json | null;
          raw?: Json | null;
          paid_at?: string | null;
        };
        Relationships: [];
      };
      refunds: {
        Row: {
          id: string;
          order_id: string;
          payment_id: string;
          amount: number;
          reason: string | null;
          provider_ref: string | null;
          status: string;
          actor: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_id: string;
          amount: number;
          reason?: string | null;
          provider_ref?: string | null;
          status?: string;
          actor?: string | null;
          created_at?: string;
        };
        Update: { status?: string; provider_ref?: string | null };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          event_id: string;
          event_type: string;
          payload: Json;
          processed_at: string | null;
          error: string | null;
          received_at: string;
        };
        Insert: {
          event_id: string;
          event_type: string;
          payload: Json;
          processed_at?: string | null;
          error?: string | null;
          received_at?: string;
        };
        Update: { processed_at?: string | null; error?: string | null };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor: string | null;
          action: string;
          entity: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          created_at: string;
          source: string;
          device_id: string | null;
        };
        Insert: {
          id?: number;
          actor?: string | null;
          action: string;
          entity: string;
          entity_id?: string | null;
          before?: Json | null;
          after?: Json | null;
          created_at?: string;
          source?: string;
          device_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      reviews: {
        Row: {
          id: string;
          product_id: string;
          user_id: string;
          order_id: string | null;
          rating: number;
          title: string | null;
          body: string | null;
          is_verified_purchase: boolean;
          is_published: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          user_id: string;
          order_id?: string | null;
          rating: number;
          title?: string | null;
          body?: string | null;
          is_verified_purchase?: boolean;
          is_published?: boolean;
          created_at?: string;
        };
        Update: {
          rating?: number;
          title?: string | null;
          body?: string | null;
          is_published?: boolean;
        };
        Relationships: [];
      };
      wishlist_items: {
        Row: { user_id: string; variant_id: string; created_at: string };
        Insert: { user_id: string; variant_id: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
      staff_devices: {
        Row: {
          id: string;
          device_id: string;
          user_id: string;
          label: string | null;
          os: string | null;
          app_version: string | null;
          is_revoked: boolean;
          last_seen_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          device_id: string;
          user_id: string;
          label?: string | null;
          os?: string | null;
          app_version?: string | null;
          is_revoked?: boolean;
          last_seen_at?: string;
          created_at?: string;
        };
        Update: {
          label?: string | null;
          os?: string | null;
          app_version?: string | null;
          is_revoked?: boolean;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      outbox_receipts: {
        Row: {
          idempotency_key: string;
          device_id: string;
          kind: string;
          result: Json | null;
          created_at: string;
        };
        Insert: {
          idempotency_key: string;
          device_id: string;
          kind: string;
          result?: Json | null;
          created_at?: string;
        };
        Update: { result?: Json | null };
        Relationships: [];
      };
      notifications: {
        Row: { id: number; order_id: string; event: string; channel: string; sent_at: string };
        Insert: {
          id?: number;
          order_id: string;
          event: string;
          channel?: string;
          sent_at?: string;
        };
        Update: { sent_at?: string };
        Relationships: [];
      };
      email_suppressions: {
        Row: { email: string; reason: string | null; created_at: string };
        Insert: { email: string; reason?: string | null; created_at?: string };
        Update: { reason?: string | null };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_order: {
        Args: {
          p_cart_id: string;
          p_email: string;
          p_phone: string;
          p_ship_to: Json;
          p_zone_id: string;
          p_coupon?: string;
          p_user_id?: string;
        };
        Returns: Database['public']['Tables']['orders']['Row'];
      };
      commit_paid_order: {
        Args: { p_order_id: string };
        Returns: undefined;
      };
      adjust_stock: {
        Args: {
          p_variant: string;
          p_delta: number;
          p_reason: string;
          p_actor?: string | null;
          p_order?: string | null;
        };
        Returns: number;
      };
      register_staff_device: {
        Args: {
          p_device_id: string;
          p_label?: string | null;
          p_os?: string | null;
          p_app_version?: string | null;
        };
        Returns: boolean;
      };
      release_expired_reservations: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      search_products: {
        Args: {
          q?: string;
          p_category?: string;
          p_brand?: string;
          p_condition?: Database['public']['Enums']['product_cond'];
          p_in_stock?: boolean;
          p_min_price?: number;
          p_max_price?: number;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Database['public']['Tables']['products']['Row'][];
      };
    };
    Enums: {
      user_role: 'customer' | 'staff' | 'admin';
      product_cond: 'new' | 'open_box' | 'refurbished' | 'used';
      order_status:
        | 'pending'
        | 'confirmed'
        | 'packed'
        | 'dispatched'
        | 'delivered'
        | 'cancelled'
        | 'refunded'
        | 'oversold';
      payment_status:
        'unpaid' | 'processing' | 'paid' | 'failed' | 'refunded' | 'partially_refunded';
      pay_provider: 'paystack' | 'manual';
      coupon_kind: 'percent' | 'fixed' | 'free_shipping';
      order_channel: 'online' | 'walk_in';
    };
    CompositeTypes: Record<never, never>;
  };
}

// ── Convenience helpers (mirror the Supabase generator's exports) ──────────────
type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
export type Functions<T extends keyof PublicSchema['Functions']> = PublicSchema['Functions'][T];
