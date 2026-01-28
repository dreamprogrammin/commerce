export type Json
  = | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '12.2.3 (519615d)'
  }
  public: {
    Tables: {
      attribute_options: {
        Row: {
          attribute_id: number
          id: number
          meta: Json | null
          value: string
        }
        Insert: {
          attribute_id: number
          id?: number
          meta?: Json | null
          value: string
        }
        Update: {
          attribute_id?: number
          id?: number
          meta?: Json | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attribute_options_attribute_id_fkey'
            columns: ['attribute_id']
            isOneToOne: false
            referencedRelation: 'attributes'
            referencedColumns: ['id']
          },
        ]
      }
      attributes: {
        Row: {
          display_type: string
          id: number
          name: string
          slug: string
        }
        Insert: {
          display_type?: string
          id?: number
          name: string
          slug: string
        }
        Update: {
          display_type?: string
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          blur_data_url: string | null
          created_at: string
          cta_link: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          placement: string
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          title: string
          updated_at: string
        }
        Insert: {
          blur_data_url?: string | null
          created_at?: string
          cta_link?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          blur_data_url?: string | null
          created_at?: string
          cta_link?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          placement?: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bonus_activation_skipped: {
        Row: {
          bonuses_amount: number | null
          created_at: string | null
          id: string
          order_id: string | null
          pending_balance: number | null
          reason: string
          user_id: string | null
        }
        Insert: {
          bonuses_amount?: number | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          pending_balance?: number | null
          reason: string
          user_id?: string | null
        }
        Update: {
          bonuses_amount?: number | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          pending_balance?: number | null
          reason?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'bonus_activation_skipped_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
        ]
      }
      bonus_transactions: {
        Row: {
          activation_date: string | null
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          order_id: string | null
          pending_balance_after: number
          status: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          activation_date?: string | null
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          pending_balance_after?: number
          status?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          activation_date?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string | null
          pending_balance_after?: number
          status?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'bonus_transactions_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'bonus_transactions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          seo_description: string | null
          seo_keywords: string[] | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          blur_placeholder: string | null
          created_at: string
          description: string | null
          display_in_menu: boolean
          display_order: number
          featured_order: number | null
          href: string
          icon_name: string | null
          id: string
          image_url: string | null
          is_featured: boolean
          is_root_category: boolean
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          blur_placeholder?: string | null
          created_at?: string
          description?: string | null
          display_in_menu?: boolean
          display_order?: number
          featured_order?: number | null
          href: string
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_root_category?: boolean
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          blur_placeholder?: string | null
          created_at?: string
          description?: string | null
          display_in_menu?: boolean
          display_order?: number
          featured_order?: number | null
          href?: string
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean
          is_root_category?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      category_attributes: {
        Row: {
          attribute_id: number
          category_id: string
        }
        Insert: {
          attribute_id: number
          category_id: string
        }
        Update: {
          attribute_id?: number
          category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'category_attributes_attribute_id_fkey'
            columns: ['attribute_id']
            isOneToOne: false
            referencedRelation: 'attributes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'category_attributes_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      children: {
        Row: {
          birth_date: string
          created_at: string
          gender: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date: string
          created_at?: string
          gender: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string
          created_at?: string
          gender?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string | null
          id: number
          name: string
        }
        Insert: {
          code?: string | null
          id?: number
          name: string
        }
        Update: {
          code?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      guest_checkout_items: {
        Row: {
          checkout_id: string
          id: string
          price_per_item: number
          product_id: string
          quantity: number
        }
        Insert: {
          checkout_id: string
          id?: string
          price_per_item: number
          product_id: string
          quantity: number
        }
        Update: {
          checkout_id?: string
          id?: string
          price_per_item?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: 'guest_checkout_items_checkout_id_fkey'
            columns: ['checkout_id']
            isOneToOne: false
            referencedRelation: 'guest_checkouts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'guest_checkout_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      guest_checkouts: {
        Row: {
          assigned_admin_name: string | null
          assigned_admin_username: string | null
          assigned_at: string | null
          created_at: string
          delivery_address: Json | null
          delivery_method: string
          expires_at: string | null
          final_amount: number
          guest_email: string
          guest_name: string
          guest_phone: string
          id: string
          payment_method: string | null
          processed_at: string | null
          status: string
          telegram_message_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          created_at?: string
          delivery_address?: Json | null
          delivery_method: string
          expires_at?: string | null
          final_amount: number
          guest_email: string
          guest_name: string
          guest_phone: string
          id?: string
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          created_at?: string
          delivery_address?: Json | null
          delivery_method?: string
          expires_at?: string | null
          final_amount?: number
          guest_email?: string
          guest_name?: string
          guest_phone?: string
          id?: string
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          bonus_points_per_item: number
          id: string
          order_id: string
          price_per_item: number
          product_id: string
          quantity: number
        }
        Insert: {
          bonus_points_per_item: number
          id?: string
          order_id: string
          price_per_item: number
          product_id: string
          quantity: number
        }
        Update: {
          bonus_points_per_item?: number
          id?: string
          order_id?: string
          price_per_item?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          is_read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type?: string
          title: string
          body?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: string
          title?: string
          body?: string | null
          link?: string | null
          is_read?: boolean
          created_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          assigned_admin_name: string | null
          assigned_admin_username: string | null
          assigned_at: string | null
          bonuses_activation_date: string | null
          bonuses_awarded: number
          bonuses_spent: number
          created_at: string
          delivery_address: Json | null
          delivery_method: string
          discount_amount: number
          final_amount: number
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          payment_method: string | null
          status: string
          telegram_message_id: string | null
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          bonuses_activation_date?: string | null
          bonuses_awarded?: number
          bonuses_spent?: number
          created_at?: string
          delivery_address?: Json | null
          delivery_method: string
          discount_amount?: number
          final_amount: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_method?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          bonuses_activation_date?: string | null
          bonuses_awarded?: number
          bonuses_spent?: number
          created_at?: string
          delivery_address?: Json | null
          delivery_method?: string
          discount_amount?: number
          final_amount?: number
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_method?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: number
          option_id: number | null
          product_id: string
        }
        Insert: {
          attribute_id: number
          option_id?: number | null
          product_id: string
        }
        Update: {
          attribute_id?: number
          option_id?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'product_attribute_values_attribute_id_fkey'
            columns: ['attribute_id']
            isOneToOne: false
            referencedRelation: 'attributes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'product_attribute_values_option_id_fkey'
            columns: ['option_id']
            isOneToOne: false
            referencedRelation: 'attribute_options'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'product_attribute_values_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          blur_placeholder: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
        }
        Insert: {
          alt_text?: string | null
          blur_placeholder?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
        }
        Update: {
          alt_text?: string | null
          blur_placeholder?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'product_images_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      products: {
        Row: {
          accessory_ids: string[] | null
          barcode: string | null
          bonus_points_award: number
          brand_id: string | null
          category_id: string | null
          created_at: string
          description: string | null
          discount_percentage: number
          featured_order: number | null
          gender: string | null
          id: string
          is_accessory: boolean
          is_active: boolean
          is_featured: boolean | null
          material_id: number | null
          max_age_years: number | null
          min_age_years: number | null
          name: string
          origin_country_id: number | null
          price: number
          sales_count: number
          seo_description: string | null
          seo_keywords: string[] | null
          sku: string | null
          slug: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          accessory_ids?: string[] | null
          barcode?: string | null
          bonus_points_award?: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_percentage?: number
          featured_order?: number | null
          gender?: string | null
          id?: string
          is_accessory?: boolean
          is_active?: boolean
          is_featured?: boolean | null
          material_id?: number | null
          max_age_years?: number | null
          min_age_years?: number | null
          name: string
          origin_country_id?: number | null
          price: number
          sales_count?: number
          seo_description?: string | null
          seo_keywords?: string[] | null
          sku?: string | null
          slug: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          accessory_ids?: string[] | null
          barcode?: string | null
          bonus_points_award?: number
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          discount_percentage?: number
          featured_order?: number | null
          gender?: string | null
          id?: string
          is_accessory?: boolean
          is_active?: boolean
          is_featured?: boolean | null
          material_id?: number | null
          max_age_years?: number | null
          min_age_years?: number | null
          name?: string
          origin_country_id?: number | null
          price?: number
          sales_count?: number
          seo_description?: string | null
          seo_keywords?: string[] | null
          sku?: string | null
          slug?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'products_brand_id_fkey'
            columns: ['brand_id']
            isOneToOne: false
            referencedRelation: 'brands'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'products_material_id_fkey'
            columns: ['material_id']
            isOneToOne: false
            referencedRelation: 'materials'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'products_origin_country_id_fkey'
            columns: ['origin_country_id']
            isOneToOne: false
            referencedRelation: 'countries'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          active_bonus_balance: number
          created_at: string
          first_name: string | null
          has_received_welcome_bonus: boolean
          id: string
          last_name: string | null
          pending_bonus_balance: number
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active_bonus_balance?: number
          created_at?: string
          first_name?: string | null
          has_received_welcome_bonus?: boolean
          id: string
          last_name?: string | null
          pending_bonus_balance?: number
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          active_bonus_balance?: number
          created_at?: string
          first_name?: string | null
          has_received_welcome_bonus?: boolean
          id?: string
          last_name?: string | null
          pending_bonus_balance?: number
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      slides: {
        Row: {
          blur_placeholder: string | null
          blur_placeholder_mobile: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          image_url_mobile: string | null
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          blur_placeholder?: string | null
          blur_placeholder_mobile?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          image_url_mobile?: string | null
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          blur_placeholder?: string | null
          blur_placeholder_mobile?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          image_url_mobile?: string | null
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          address_line1: string
          city: string
          created_at: string
          id: string
          is_default: boolean
          postal_code: string | null
          user_id: string
        }
        Insert: {
          address_line1: string
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          postal_code?: string | null
          user_id: string
        }
        Update: {
          address_line1?: string
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          postal_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'wishlist_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      all_orders_stats: {
        Row: {
          order_type: string | null
          total_bonuses_awarded: number | null
          total_bonuses_spent: number | null
          total_orders: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      bonus_system_status: {
        Row: {
          bonuses_ready_for_activation: number | null
          orders_ready_for_activation: number | null
          total_active_bonuses: number | null
          total_pending_bonuses: number | null
          users_with_active_bonuses: number | null
          users_with_pending_bonuses: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_pending_bonuses: { Args: never, Returns: string }
      activate_pending_order_bonuses: { Args: never, Returns: number }
      cancel_order: {
        Args: { p_order_id: string, p_table_name?: string }
        Returns: string
      }
      cleanup_expired_guest_checkouts: { Args: never, Returns: number }
      confirm_and_process_order:
        | { Args: { p_order_id: string }, Returns: string }
        | {
          Args: { p_order_id: string, p_table_name?: string }
          Returns: string
        }
      create_guest_checkout: {
        Args: {
          p_cart_items: Json
          p_delivery_address?: Json
          p_delivery_method: string
          p_guest_info: Json
          p_payment_method?: string
        }
        Returns: string
      }
      create_order: {
        Args: {
          p_bonuses_to_spend?: number
          p_cart_items: Json
          p_delivery_address?: Json
          p_delivery_method: string
          p_guest_info?: Json
          p_payment_method?: string
        }
        Returns: string
      }
      create_user_order: {
        Args: {
          p_bonuses_to_spend?: number
          p_cart_items: Json
          p_delivery_address?: Json
          p_delivery_method: string
          p_payment_method?: string
        }
        Returns: string
      }
      current_user_has_role_internal: {
        Args: { required_role: string }
        Returns: boolean
      }
      get_bonus_history: {
        Args: { p_limit?: number, p_offset?: number }
        Returns: {
          activation_date: string
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          order_id: string
          pending_balance_after: number
          status: string
          transaction_type: string
        }[]
      }
      get_brands_by_category_slug: {
        Args: { p_category_slug: string }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      get_category_and_children_ids: {
        Args: { p_category_slug: string }
        Returns: {
          id: string
        }[]
      }
      get_category_price_range: {
        Args: { p_category_slug: string }
        Returns: {
          max_price: number
          min_price: number
        }[]
      }
      get_cron_status: {
        Args: never
        Returns: {
          is_configured: boolean
          last_run: string
          last_status: string
        }[]
      }
      get_cron_status_safe: {
        Args: never
        Returns: {
          last_run: string
          last_status: string
        }[]
      }
      get_filtered_products: {
        Args: {
          p_attributes?: Database['public']['CompositeTypes']['attribute_filter'][]
          p_brand_ids?: string[]
          p_category_slug: string
          p_country_ids?: string[]
          p_material_ids?: string[]
          p_page_number?: number
          p_page_size?: number
          p_price_max?: number
          p_price_min?: number
          p_sort_by?: string
          p_subcategory_ids?: string[]
        }
        Returns: {
          accessory_ids: string[]
          barcode: string
          bonus_points_award: number
          brand_id: string
          brand_name: string
          brand_slug: string
          category_id: string
          created_at: string
          description: string
          discount_percentage: number
          gender: string
          id: string
          is_accessory: boolean
          is_active: boolean
          material_id: number
          max_age_years: number
          min_age_years: number
          name: string
          origin_country_id: number
          price: number
          product_images: Json
          sales_count: number
          slug: string
          stock_quantity: number
          updated_at: string
        }[]
      }
      get_order_table_name: { Args: { p_order_id: string }, Returns: string }
      get_personalized_recommendations: {
        Args: { p_limit?: number, p_user_id: string }
        Returns: {
          accessory_ids: string[]
          barcode: string
          bonus_points_award: number
          brand_id: string
          category_id: string
          created_at: string
          description: string
          discount_percentage: number
          gender: string
          id: string
          is_accessory: boolean
          is_active: boolean
          material_id: number
          max_age_years: number
          min_age_years: number
          name: string
          origin_country_id: number
          price: number
          product_images: Json
          sales_count: number
          slug: string
          stock_quantity: number
          updated_at: string
        }[]
      }
      is_admin: { Args: never, Returns: boolean }
      process_confirmed_guest_checkout: {
        Args: { p_checkout_id: string }
        Returns: string
      }
      process_confirmed_order: { Args: { p_order_id: string }, Returns: string }
      recalculate_pending_balances: { Args: never, Returns: string }
      test_telegram_notification: {
        Args: { p_order_id: string, p_table_name?: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      attribute_filter: {
        slug: string | null
        option_ids: number[] | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
      ? R
      : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables']
    & DefaultSchema['Views'])
    ? (DefaultSchema['Tables']
      & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
        ? R
        : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Insert: infer I
  }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Update: infer U
  }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema['Enums']
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema['CompositeTypes']
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
