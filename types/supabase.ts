export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
            foreignKeyName: "attribute_options_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
        ]
      }
      attributes: {
        Row: {
          display_type: string
          id: number
          name: string
          slug: string
          unit: string | null
        }
        Insert: {
          display_type?: string
          id?: number
          name: string
          slug: string
          unit?: string | null
        }
        Update: {
          display_type?: string
          id?: number
          name?: string
          slug?: string
          unit?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          alt_text: string | null
          blur_data_url: string | null
          blur_placeholder: string | null
          created_at: string
          cta_link: string | null
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          placement: string
          seo_description: string | null
          seo_keywords: string[] | null
          seo_title: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          created_at?: string
          cta_link?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          placement?: string
          seo_description?: string | null
          seo_keywords?: string[] | null
          seo_title?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          created_at?: string
          cta_link?: string | null
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
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
            foreignKeyName: "bonus_activation_skipped_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
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
            foreignKeyName: "bonus_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          brand_id: string
          created_at: string
          id: string
          is_auto_generated: boolean | null
          question_text: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          brand_id: string
          created_at?: string
          id?: string
          is_auto_generated?: boolean | null
          question_text: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          brand_id?: string
          created_at?: string
          id?: string
          is_auto_generated?: boolean | null
          question_text?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_questions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          blur_data_url: string | null
          blur_placeholder: string | null
          canonical_url: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          name: string
          og_description: string | null
          og_image: string | null
          og_title: string | null
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_text: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          blur_data_url?: string | null
          blur_placeholder?: string | null
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          name: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          blur_data_url?: string | null
          blur_placeholder?: string | null
          canonical_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          name?: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          allowed_brand_ids: string[] | null
          allowed_product_line_ids: string[] | null
          blur_data_url: string | null
          blur_placeholder: string | null
          canonical_url: string | null
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
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          name: string
          og_description: string | null
          og_image: string | null
          og_title: string | null
          parent_id: string | null
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_text: string | null
          seo_title: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          allowed_brand_ids?: string[] | null
          allowed_product_line_ids?: string[] | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          canonical_url?: string | null
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
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          name: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          parent_id?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          allowed_brand_ids?: string[] | null
          allowed_product_line_ids?: string[] | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          canonical_url?: string | null
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
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          name?: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          parent_id?: string | null
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
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
            foreignKeyName: "category_attributes_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          category_id: string
          created_at: string
          id: string
          is_auto_generated: boolean | null
          question_text: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          category_id: string
          created_at?: string
          id?: string
          is_auto_generated?: boolean | null
          question_text: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          category_id?: string
          created_at?: string
          id?: string
          is_auto_generated?: boolean | null
          question_text?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      country_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          country_id: number
          created_at: string | null
          id: string
          is_auto_generated: boolean | null
          question_text: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          country_id: number
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          question_text: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          country_id?: number
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          question_text?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "country_questions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "country_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "guest_checkout_items_checkout_id_fkey"
            columns: ["checkout_id"]
            isOneToOne: false
            referencedRelation: "guest_checkouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_checkout_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_checkouts: {
        Row: {
          assigned_admin_name: string | null
          assigned_admin_username: string | null
          assigned_at: string | null
          cancelled_by: string | null
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
          status: string
          telegram_message_id: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          cancelled_by?: string | null
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
          status?: string
          telegram_message_id?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          cancelled_by?: string | null
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
          status?: string
          telegram_message_id?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      material_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          created_at: string | null
          id: string
          is_auto_generated: boolean | null
          material_id: number
          question_text: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          material_id: number
          question_text: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          material_id?: number
          question_text?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_questions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          title?: string
          type?: string
          user_id?: string
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
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_admin_name: string | null
          assigned_admin_username: string | null
          assigned_at: string | null
          bonuses_activation_date: string | null
          bonuses_awarded: number
          bonuses_spent: number
          cancelled_by: string | null
          created_at: string
          delivery_address: Json | null
          delivery_method: string
          discount_amount: number
          final_amount: number
          guest_checkout_id: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          payment_method: string | null
          status: string
          telegram_message_id: string | null
          total_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          bonuses_activation_date?: string | null
          bonuses_awarded?: number
          bonuses_spent?: number
          cancelled_by?: string | null
          created_at?: string
          delivery_address?: Json | null
          delivery_method: string
          discount_amount?: number
          final_amount: number
          guest_checkout_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_method?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_admin_name?: string | null
          assigned_admin_username?: string | null
          assigned_at?: string | null
          bonuses_activation_date?: string | null
          bonuses_awarded?: number
          bonuses_spent?: number
          cancelled_by?: string | null
          created_at?: string
          delivery_address?: Json | null
          delivery_method?: string
          discount_amount?: number
          final_amount?: number
          guest_checkout_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_method?: string | null
          status?: string
          telegram_message_id?: string | null
          total_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_accessories: {
        Row: {
          accessory_product_id: string
          created_at: string
          main_product_id: string
        }
        Insert: {
          accessory_product_id: string
          created_at?: string
          main_product_id: string
        }
        Update: {
          accessory_product_id?: string
          created_at?: string
          main_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_accessories_accessory_product_id_fkey"
            columns: ["accessory_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_accessories_main_product_id_fkey"
            columns: ["main_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: number
          numeric_value: number | null
          option_id: number | null
          product_id: string
        }
        Insert: {
          attribute_id: number
          numeric_value?: number | null
          option_id?: number | null
          product_id: string
        }
        Update: {
          attribute_id?: number
          numeric_value?: number | null
          option_id?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "attribute_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          blur_data_url: string | null
          blur_placeholder: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
        }
        Insert: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
        }
        Update: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_placeholder?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_line_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          created_at: string | null
          id: string
          is_auto_generated: boolean | null
          product_line_id: string
          question_text: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          product_line_id: string
          question_text: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          product_line_id?: string
          question_text?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_line_questions_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_line_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lines: {
        Row: {
          brand_id: string
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
          brand_id: string
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
          brand_id?: string
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
        Relationships: [
          {
            foreignKeyName: "product_lines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      product_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          created_at: string | null
          id: string
          is_auto_generated: boolean | null
          is_published: boolean | null
          product_id: string
          question_text: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          is_published?: boolean | null
          product_id: string
          question_text: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string | null
          id?: string
          is_auto_generated?: boolean | null
          is_published?: boolean | null
          product_id?: string
          question_text?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_questions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_questions_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string
          custom_fields_schema: Json | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_fields_schema?: Json | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_fields_schema?: Json | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          accessory_ids: string[] | null
          barcode: string | null
          bonus_points_award: number
          brand_id: string | null
          canonical_url: string | null
          category_id: string | null
          country_id: number | null
          created_at: string
          custom_fields_data: Json | null
          description: string | null
          discount_percentage: number
          featured_order: number | null
          final_price: number | null
          gender: string | null
          id: string
          is_accessory: boolean
          is_active: boolean
          is_featured: boolean | null
          is_new: boolean
          is_on_promotion: boolean
          is_on_sale: boolean | null
          material_id: number | null
          material_ids: number[] | null
          max_age: number | null
          max_age_years: number | null
          meta_description: string | null
          meta_keywords: string[] | null
          meta_title: string | null
          min_age: number | null
          min_age_years: number | null
          name: string
          og_description: string | null
          og_image: string | null
          og_title: string | null
          origin_country_id: number | null
          piece_count: number | null
          price: number
          product_line_id: string | null
          product_type: string | null
          product_type_id: number | null
          sales_count: number
          seo_description: string | null
          seo_h1: string | null
          seo_keywords: string[] | null
          seo_text: string | null
          seo_title: string | null
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
          canonical_url?: string | null
          category_id?: string | null
          country_id?: number | null
          created_at?: string
          custom_fields_data?: Json | null
          description?: string | null
          discount_percentage?: number
          featured_order?: number | null
          final_price?: number | null
          gender?: string | null
          id?: string
          is_accessory?: boolean
          is_active?: boolean
          is_featured?: boolean | null
          is_new?: boolean
          is_on_promotion?: boolean
          is_on_sale?: boolean | null
          material_id?: number | null
          material_ids?: number[] | null
          max_age?: number | null
          max_age_years?: number | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          min_age?: number | null
          min_age_years?: number | null
          name: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          origin_country_id?: number | null
          piece_count?: number | null
          price: number
          product_line_id?: string | null
          product_type?: string | null
          product_type_id?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
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
          canonical_url?: string | null
          category_id?: string | null
          country_id?: number | null
          created_at?: string
          custom_fields_data?: Json | null
          description?: string | null
          discount_percentage?: number
          featured_order?: number | null
          final_price?: number | null
          gender?: string | null
          id?: string
          is_accessory?: boolean
          is_active?: boolean
          is_featured?: boolean | null
          is_new?: boolean
          is_on_promotion?: boolean
          is_on_sale?: boolean | null
          material_id?: number | null
          material_ids?: number[] | null
          max_age?: number | null
          max_age_years?: number | null
          meta_description?: string | null
          meta_keywords?: string[] | null
          meta_title?: string | null
          min_age?: number | null
          min_age_years?: number | null
          name?: string
          og_description?: string | null
          og_image?: string | null
          og_title?: string | null
          origin_country_id?: number | null
          piece_count?: number | null
          price?: number
          product_line_id?: string | null
          product_type?: string | null
          product_type_id?: number | null
          sales_count?: number
          seo_description?: string | null
          seo_h1?: string | null
          seo_keywords?: string[] | null
          seo_text?: string | null
          seo_title?: string | null
          sku?: string | null
          slug?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_origin_country_id_fkey"
            columns: ["origin_country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_product_type_fkey"
            columns: ["product_type"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["slug"]
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
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
          alt_text: string | null
          blur_data_url: string | null
          blur_data_url_mobile: string | null
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
          link_url: string | null
          meta_description: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_data_url_mobile?: string | null
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
          link_url?: string | null
          meta_description?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          blur_data_url?: string | null
          blur_data_url_mobile?: string | null
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
          link_url?: string | null
          meta_description?: string | null
          subtitle?: string | null
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
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bonus_system_status: {
        Row: {
          bonuses_ready_for_activation: number | null
          cron_is_configured: boolean | null
          last_cron_run: string | null
          last_cron_status: string | null
          orders_ready_for_activation: number | null
          skipped_last_7_days: number | null
          users_with_active_bonuses: number | null
          users_with_negative_balance: number | null
          users_with_pending_bonuses: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_my_pending_bonuses: { Args: never; Returns: Json }
      activate_pending_bonuses: { Args: never; Returns: string }
      cancel_order:
        | {
            Args: { p_order_id: string; p_table_name?: string }
            Returns: string
          }
        | {
            Args: {
              p_cancelled_by?: string
              p_order_id: string
              p_table_name?: string
            }
            Returns: string
          }
      confirm_and_process_order: {
        Args: { p_order_id: string }
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
      generate_brand_questions: {
        Args: { p_brand_id: string; p_skip_ai?: boolean }
        Returns: Json
      }
      generate_category_questions: {
        Args: { p_category_id: string; p_skip_ai?: boolean }
        Returns: Json
      }
      generate_product_questions: {
        Args: { p_product_id: string; p_skip_ai?: boolean }
        Returns: Json
      }
      generate_questions_for_all_brands: {
        Args: never
        Returns: {
          brand_id: string
          is_premium: boolean
          questions_count: number
        }[]
      }
      generate_questions_for_all_categories: {
        Args: never
        Returns: {
          category_id: string
          is_premium: boolean
          questions_count: number
        }[]
      }
      generate_questions_for_all_products: {
        Args: never
        Returns: {
          is_premium: boolean
          product_id: string
          questions_count: number
        }[]
      }
      get_bonus_history: {
        Args: { p_limit?: number; p_offset?: number }
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
          blur_placeholder: string
          id: string
          logo_url: string
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
      get_category_and_children_ids_by_uuid: {
        Args: { p_category_id: string }
        Returns: {
          id: string
        }[]
      }
      get_category_piece_count_range: {
        Args: { p_category_slug: string }
        Returns: {
          max_count: number
          min_count: number
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
      get_filtered_products: {
        Args: {
          p_attributes?: Database["public"]["CompositeTypes"]["attribute_filter"][]
          p_brand_ids?: string[]
          p_category_slug: string
          p_country_ids?: string[]
          p_material_ids?: string[]
          p_numeric_attributes?: Database["public"]["CompositeTypes"]["numeric_attribute_filter"][]
          p_page_number?: number
          p_page_size?: number
          p_piece_count_max?: number
          p_piece_count_min?: number
          p_price_max?: number
          p_price_min?: number
          p_product_line_ids?: string[]
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
      get_numeric_attribute_range: {
        Args: { p_attribute_id: number; p_category_slug: string }
        Returns: {
          max_value: number
          min_value: number
        }[]
      }
      get_order_table_name: { Args: { p_order_id: string }; Returns: string }
      get_personalized_recommendations: {
        Args: { p_limit?: number; p_user_id: string }
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
      get_product_lines_by_brand: {
        Args: { p_brand_id: string }
        Returns: {
          description: string
          id: string
          logo_url: string
          name: string
          slug: string
        }[]
      }
      get_product_lines_by_category_slug: {
        Args: { p_category_slug: string }
        Returns: {
          brand_id: string
          brand_name: string
          id: string
          logo_url: string
          name: string
          product_count: number
          slug: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      merge_anon_user_into_real_user: {
        Args: { new_real_user_id: string; old_anon_user_id: string }
        Returns: string
      }
      process_confirmed_order: { Args: { p_order_id: string }; Returns: string }
      recalculate_pending_balances: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      attribute_filter: {
        slug: string | null
        option_ids: number[] | null
      }
      numeric_attribute_filter: {
        attribute_id: number | null
        min_value: number | null
        max_value: number | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
