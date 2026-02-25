import type { Database, Tables, TablesInsert, TablesUpdate } from './supabase'

export interface Brand extends Tables<'brands'> { }

// Линейка продуктов (подбренд/франшиза, например: Mattel → Barbie, Hot Wheels)
export interface ProductLine {
  id: string
  brand_id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  seo_description: string | null
  seo_keywords: string[] | null
  created_at: string
  updated_at: string
}

export type ProductLineInsert = Omit<ProductLine, 'id' | 'created_at' | 'updated_at'>
export type ProductLineUpdate = Partial<ProductLineInsert>

// Линейка с информацией о бренде (для фильтров)
export interface ProductLineWithBrand extends ProductLine {
  brand_name: string
  product_count?: number
}

// Упрощенный тип для отображения
export type SimpleProductLine = Pick<ProductLine, 'id' | 'name' | 'slug'>

export interface Country extends Tables<'countries'> { }

export interface Material extends Tables<'materials'> { }

export type AttributeValuePayload = Omit<ProductAttributeValueInsert, 'product_id'>

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
  /** SEO-имя для файла (будет в формате: uhti-{seoName}-{uuid}.ext) */
  seoName?: string
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

export interface AttributeFilter {
  slug: string
  option_ids: number[]
}

export interface NumericAttributeFilter {
  attributeId: number
  minValue?: number
  maxValue?: number
}

export type SortByType = 'popularity' | 'newest' | 'price_asc' | 'price_desc'

export interface IProductFilters {
  categorySlug: string
  subCategoryIds?: string[]
  brandIds?: string[]
  productLineIds?: string[]
  priceMin?: number
  priceMax?: number
  pieceCountMin?: number
  pieceCountMax?: number
  sortBy?: SortByType
  materialIds?: string[]
  countryIds?: string[]
  attributes?: AttributeFilter[]
  numericAttributes?: NumericAttributeFilter[]
}

export interface ICheckoutData {
  deliveryMethod: 'pickup' | 'courier'
  paymentMethod: string
  deliveryAddress?: { line1: string, city: string, postalCode?: string }
  guestInfo?: { name: string, email: string, phone: string }
  promoCode?: string
}

export type CategoryRow = Database['public']['Tables']['categories']['Row'] & {
  featured_order?: number | null // 🆕 Добавляем поле для управления размером карточки
  // 🆕 SEO поля (добавляем вручную, пока не обновлены типы Supabase)
  seo_title?: string | null
  seo_h1?: string | null
  seo_text?: string | null
  seo_keywords?: string[] | null
  // 🆕 Meta-теги для поисковых систем
  meta_title?: string | null
  meta_description?: string | null
  meta_keywords?: string[] | null
  // 🆕 Фильтры по брендам и линейкам
  allowed_brand_ids?: string[] | null
  allowed_product_line_ids?: string[] | null
}

export type CategoryInsert = Database['public']['Tables']['categories']['Insert'] & {
  featured_order?: number | null
  // 🆕 SEO поля
  seo_title?: string | null
  seo_h1?: string | null
  seo_text?: string | null
  seo_keywords?: string[] | null
  // 🆕 Meta-теги для поисковых систем
  meta_title?: string | null
  meta_description?: string | null
  meta_keywords?: string[] | null
  // 🆕 Фильтры
  allowed_brand_ids?: string[] | null
  allowed_product_line_ids?: string[] | null
}

export type CategoryUpdate = Database['public']['Tables']['categories']['Update'] & {
  featured_order?: number | null
  // 🆕 SEO поля
  seo_title?: string | null
  seo_h1?: string | null
  seo_text?: string | null
  seo_keywords?: string[] | null
  // 🆕 Meta-теги для поисковых систем
  meta_title?: string | null
  meta_description?: string | null
  meta_keywords?: string[] | null
  // 🆕 Фильтры
  allowed_brand_ids?: string[] | null
  allowed_product_line_ids?: string[] | null
}

export type CategoryMenuItem = CategoryRow & {
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
  _blurPlaceholder?: string // 🆕 Добавляем для хранения blur data URL
}

export interface IBreadcrumbItem {
  id: string
  name: string
  href?: string
}

export type ChildrenRow = Database['public']['Tables']['children']['Row']
export type ChildrenInsert = Omit<ChildrenRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>
export type ChildrenUpdate = Partial<ChildrenInsert>

export type ProductImageRow = Database['public']['Tables']['product_images']['Row']

export type ProductWithGallery = Omit<ProductRow, 'brand_id'> & {
  product_images: ProductImageRow[]
  brands?: SimpleBrand | null
}

export interface CustomFieldSchema {
  [key: string]: {
    label: string
    type: 'boolean' | 'text' | 'number' | 'select'
    options?: string[]
  }
}

export interface ProductAccessoryLink {
  accessory: ProductRow & {
    product_images: ProductImageRow[]
  }
}

export type FullProduct = ProductWithImages & {
  categories: { name: string | null, slug: string | null } | null
  accessories?: ProductWithImages[]

  brands: Brand | null
  product_lines: ProductLine | null // Линейка (Barbie, Hot Wheels)
  countries: Country | null
  materials: Material | null

  product_attribute_values: ProductAttributeValueWithDetails[] | null
  is_featured?: boolean
  featured_order?: number
}

export type CustomFieldValue = string | number | boolean | null

export interface ProductFormData {
  name: string
  slug: string
  description: string | null
  price: number
  cost_price: number
  category_id: string | null
  bonus_points_award: number
  stock_quantity: number
  is_active: boolean
  gender: string | null
  accessory_ids: string[] | null
  is_accessory: boolean
  min_age_years: number | null
  max_age_years: number | null
  sku: string | null
  brand_id: string | null
  product_line_id: string | null // Линейка продуктов (Barbie, Hot Wheels и т.д.)
  discount_percentage: number
  origin_country_id: number | null
  material_id: number | null
  barcode: string | null
  is_featured?: boolean
  featured_order?: number
  // Количество деталей для конструкторов (автоматический выбор диапазона)
  piece_count?: number | null
  // SEO поля
  seo_description: string | null
  seo_keywords: string[] | null
}

export type ProductSearchResult = Pick<ProductRow, 'id' | 'name' | 'price'>

export type AccessoryProduct = ProductRow & {
  product_images: ProductImageRow[]
  categories?: { name: string | null, slug: string | null } | null
}

export type ProductWithImages = ProductRow & {
  product_images: ProductImageRow[]
}
export type { Database, Tables, TablesInsert, TablesUpdate }

export type BrandInsert = TablesInsert<'brands'>

export type BrandUpdate = TablesUpdate<'brands'>
export interface Attribute extends Tables<'attributes'> { }
export interface AttributeInsert extends TablesInsert<'attributes'> { }
export interface AttributeUpdate extends TablesUpdate<'attributes'> { }

export interface AttributeOption extends Tables<'attribute_options'> { }
export interface AttributeOptionInsert extends TablesInsert<'attribute_options'> { }

export interface AttributeWithValue extends Tables<'attributes'> {
  attribute_options: Tables<'attribute_options'>[]
}

export type ProductAttributeValue = Tables<'product_attribute_values'>
export type ProductAttributeValueInsert = TablesInsert<'product_attribute_values'>

export type FilteredProductRpcResponse = Database['public']['Functions']['get_filtered_products']['Returns'][number]

export interface BrandForFilter {
  id: string
  name: string
  slug: string
  logo_url?: string | null
  products_count?: number
}

export interface ColorOptionMeta {
  hex: string
}
type RecommendedProductRpcResponse = Database['public']['Functions']['get_personalized_recommendations']['Returns'][number]

export interface RecommendedProduct extends Omit<RecommendedProductRpcResponse, 'product_images'> {
  product_images: {
    id: string
    image_url: string
    display_order: number
    alt_text: string | null
  }[]
}

export interface BaseProduct {
  id: string
  name: string
  slug: string
  price: number
  // Упрощаем тип для изображений, нам нужен только URL
  product_images: {
    image_url: string | null
    blur_placeholder?: string | null
  }[] | null
  discount_percentage?: number | null // Скидка опциональна
  // Добавьте сюда любые другие поля, которые вы используете в ProductCard
  bonus_points_award?: number | null
  stock_quantity?: number | null
  brands?: SimpleBrand | null
}

export interface SimpleAttributeOption {
  id: number
  attribute_id: number
  value: string
  meta: Record<string, unknown> | null // Используем простой объект вместо `Json`
}

export interface CatalogProduct extends Omit<FilteredProductRpcResponse, 'product_images'> {
  // Упрощаем и типизируем product_images (оно приходит как Json)
  product_images: {
    id: string
    image_url: string
    display_order: number
    alt_text: string | null
  }[]
}

export interface AttributeWithValue extends Tables<'attributes'> {
  attribute_options: Tables<'attribute_options'>[]
}

export type CategoryPriceRangeRpcResponse = Database['public']['Functions']['get_category_price_range']['Returns'][number]

export type SimpleBrand = Pick<Tables<'brands'>, 'id' | 'name' | 'slug'>

export type ProductAttributeValueWithDetails = Tables<'product_attribute_values'> & {
  attributes: (Tables<'attributes'> & {
    attribute_options: Tables<'attribute_options'>[]
  }) | null
}

export type ProductListAdmin = ProductRow & {
  categories: { name: string | null, slug: string | null } | null
  product_images: ProductImageRow[] | null
  brands: Brand | null
  countries: Country | null
  materials: Material | null
  // Нет product_attribute_values!
}

export type ProductImage = Database['public']['Tables']['product_images']['Row'] & {
  blur_placeholder?: string | null // 🆕 Добавьте вручную если не сгенерировалось
}

export type Banner = Database['public']['Tables']['banners']['Row']
export type BannerInsert = Database['public']['Tables']['banners']['Insert']
export type BannerUpdate = Database['public']['Tables']['banners']['Update']

// Product Reviews
export interface ProductReviewRow {
  id: string
  user_id: string
  product_id: string
  order_id: string | null
  rating: number
  text: string | null
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface ProductReviewWithAuthor extends ProductReviewRow {
  profiles: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null
}

export interface AdditionalMenuItem {
  id: string
  name: string
  href: string
  icon?: string
  display_order?: number
}
