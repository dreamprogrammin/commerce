import type { Database } from "./supabase";

export interface ParamsSignUp {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface IUserMetaData {
  first_name: string;
  last_name?: string;
}

export interface IParamsForgotPassword {
  email: string;
  option: {
    redirectTo: string;
  };
}

export interface IProfile {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export interface MenuItem {
  id: string;
  slug: string;
  title: string;
  href: string | null;
  description: string | null;
  item_type: 'link' | 'trigger' | 'trigger_and_link';
  parent_slug: string | null;
  display_order: number;
  image_url: string | null;
  icon_name: string | null;
  created_at: string;
  updated_at: string;
}

export type MenuItemCreate = Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>;

export type MenuItemUpdate = Partial<MenuItemCreate>;

export interface IHandlerSupabaseErrorOptions {
  operationName: string
  fallbackMessage?: string
}