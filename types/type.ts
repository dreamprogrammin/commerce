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
  email?: string | null;
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
  item_type: "link" | "trigger" | "trigger_and_link";
  parent_slug: string | null;
  display_order: number;
  image_url: string | null;
  icon_name: string | null;
  created_at: string;
  updated_at: string;
}

export type MenuItemCreate = Omit<MenuItem, "id" | "created_at" | "updated_at">;

export type MenuItemUpdate1 = Partial<MenuItemCreate>;

export interface IHandlerSupabaseErrorOptions {
  operationName: string;
  fallbackMessage?: string;
}

export interface IParentSelectOption {
  value: string;
  label: string;
}

export interface IUploadFileOptions {
  bucketName: string;
  filePathPrefix?: string;
  upsert?: boolean;
  cashControl?: string;
  contentType?: string;
}

export type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];
export type MenuItemInsert =
  Database["public"]["Tables"]["menu_items"]["Insert"];
export type MenuItemUpdate =
  Database["public"]["Tables"]["menu_items"]["Update"];

export interface IEditableMenuItem
  extends Partial<Omit<MenuItemRow, "created_at" | "updated_at">> {
  _tempId?: string;
  children: IEditableMenuItem[];
  _imageFile?: File | null;
  _imagePreviewUrl?: string | undefined;
}

export interface IItemToDelete {
  id: string;
  title: string;
  image_url: string | null;
}

export interface IStaticMainMenuItem {
  slug: string;
  title: string;
  href?: string;
  isTrigger: boolean;
  iconName?: string;
}

export type SlideRow = Database["public"]["Tables"]["slides"]["Row"];
export type SlideInsert = Database["public"]["Tables"]["slides"]["Insert"];
export type SlideUpdate = Database["public"]["Tables"]["slides"]["Update"];
