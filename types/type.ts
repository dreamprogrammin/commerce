import type { Database } from './supabase'

export interface ParamsSignUp {
  email: string
  password: string
  confirmPassword: string
}

export interface IUserMetaData {
  first_name: string
  last_name?: string
}

export interface IParamsForgotPassword {
  email: string
  option: {
    redirectTo: string
  }
}

export interface IProfile {
  id: string
  email?: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
}

export interface MenuItem {
  id: string
  slug: string
  title: string
  href: string | null
  description: string | null
  item_type: 'link' | 'trigger' | 'trigger_and_link'
  parent_slug: string | null
  display_order: number
  image_url: string | null
  icon_name: string | null
  created_at: string
  updated_at: string
}

export type MenuItemCreate = Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>

export type MenuItemUpdate1 = Partial<MenuItemCreate>

export interface IHandlerSupabaseErrorOptions {
  operationName: string
  fallbackMessage?: string
}

export interface IParentSelectOption {
  value: string
  label: string
}

export interface IUploadFileOptions {
  bucketName: string
  filePathPrefix?: string
  upsert?: boolean
  cashControl?: string
  contentType?: string
}

export interface IItemToDelete {
  id: string
  title: string
  image_url: string | null
}

export interface IStaticMainMenuItem {
  slug: string
  title: string
  href?: string
  isTrigger: boolean
  iconName?: string
}

export type SlideRow = Database['public']['Tables']['slides']['Row']
export type SlideInsert = Database['public']['Tables']['slides']['Insert']
export type SlideUpdate = Database['public']['Tables']['slides']['Update']

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type ProductRow = Database['public']['Tables']['products']['Row']
export type ProductInsert = Database['public']['Tables']['products']['Insert']
export type ProductUpdate = Database['public']['Tables']['products']['Update']

export type ProductWithCategory = ProductRow & {
  categories: {
    name: string | null
    slug: string | null
  } | null
}

export type Product = ProductRow & {
  images: string[]
}

export type SortByType = 'popularity' | 'newest' | 'price_asc' | 'price_desc'

export interface IProductFilters {
  categorySlug: string
  subCategoryIds?: string[]
  priceMin?: number
  priceMax?: number
  sortBy?: SortByType
}

export interface ICartItem {
  product: ProductRow
  quantity: number
}

export interface ICheckoutData {
  deliveryMethod: 'pickup' | 'courier'
  paymentMethod: string
  deliveryAddress?: { line1: string, city: string, postalCode?: string }
  guestInfo?: { name: string, email: string, phone: string }
}

export type CategoryRow = Database['public']['Tables']['categories']['Row']
export type CategoryInsert
  = Database['public']['Tables']['categories']['Insert']
export type CategoryUpdate
  = Database['public']['Tables']['categories']['Update']

export type CategoryMenuItem
  = Database['public']['Tables']['categories']['Row'] & {
    children?: CategoryMenuItem[]
  }

export type EditableCategory = CategoryRow & {
  children: EditableCategory[]
  // Временные поля для новых, еще не сохраненных элементов
  _tempId?: string
  _isNew?: boolean
  _isDeleted?: boolean
  _imageFile?: File | null
  _imagePreview?: string
}

export interface IBreadcrumbItem {
  id: string
  name: string
  href?: string
}

export type ChildrenRow = Database['public']['Tables']['children']['Row']
export type ChildrenInsert = Omit<ChildrenRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type ChildrenUpdate = Partial<ChildrenInsert>
