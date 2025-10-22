import type {
  AttributeWithValue,
  Brand,
  Country,
  Database,
  FullProduct,
  Material,
  ProductAttributeValueInsert,
  ProductImageRow,
  ProductInsert,
  ProductListAdmin,
  ProductSearchResult,
  ProductUpdate,
  ProductWithImages,
} from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  // --- СОСТОЯНИЕ (State) ---
  const products = ref<ProductListAdmin[]>([])
  const currentProduct = ref<FullProduct | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const brands = ref<Brand[]>([])
  const countries = ref<Country[]>([])
  const materials = ref<Material[]>([])

  // --- ЧТЕНИЕ ДАННЫХ (Read) ---

  // ФУНКЦИЯ: Загрузка всех брендов для выпадающего списка
  async function fetchAllBrands() {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      brands.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки брендов', { description: error.message })
    }
  }

  // ФУНКЦИЯ: Загрузка всех стран для выпадающего списка
  async function fetchAllCountries() {
    try {
      const { data, error } = await supabase
        .from('countries')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      countries.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки стран', { description: error.message })
    }
  }

  async function fetchAllMaterials() {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      materials.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки материалов', { description: error.message })
    }
  }

  async function fetchProducts() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`*, 
          categories(name, slug), 
          product_images(*), 
          brands(*), 
          countries(*),
          materials(*)`, // <-- УЖЕ НЕ НУЖНО ДОБАВЛЯТЬ product_attribute_values
        )
        .order('created_at', { ascending: false })
      if (error)
        throw error
      products.value = (data as ProductListAdmin[]) || [] // <-- Приводим к новому типу
    }
    catch (error: any) {
      toast.error('Ошибка загрузки товаров', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchProductById(id: string): Promise<FullProduct | null> {
    isLoading.value = true
    currentProduct.value = null // Сбрасываем для чистоты
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
        *,
        categories(name, slug),
        product_images(*),
        brands(*),
        countries(*),
        materials(*),
        product_attribute_values!left(*, attributes!left(*, attribute_options!left(*)))
      `)
        .eq('id', id)
        .single()

      if (error && error.code !== 'PGRST116')
        throw error

      // 1. Устанавливаем значение в сторе (если это нужно где-то еще)
      currentProduct.value = data as FullProduct | null

      // 2. ВОЗВРАЩАЕМ результат для использования в `useAsyncData`
      return data as FullProduct | null
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара с ID: ${id}`, { description: error.message })
      return null // <-- Возвращаем null в случае ошибки
    }
    finally {
      isLoading.value = false
    }
  }

  // ФУНКЦИЯ: Поиск товара по артикулу (SKU) для страницы создания
  async function fetchProductBySku(sku: string): Promise<FullProduct | null> {
    if (!sku)
      return null
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(name, slug),
          product_images(*),
          brands(*),
          countries(*),
          materials(*)
        `)
        .eq('sku', sku.trim())
        .single()

      // Ошибка "no rows found" (PGRST116) - это ожидаемый результат, если товара нет
      if (error && error.code !== 'PGRST116')
        throw error

      return data as FullProduct | null
    }
    catch (error: any) {
      toast.error('Ошибка поиска по артикулу', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchProductsByIds(ids: string[]): Promise<ProductWithImages[]> {
    if (!ids || ids.length === 0) {
      return [] // Всегда возвращаем массив
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*)')
        .in('id', ids)

      if (error)
        throw error

      // Если `data` равно `null`, мы все равно вернем пустой массив
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки связанных товаров', { description: error.message })
      return [] // Всегда возвращаем массив в случае ошибки
    }
  }

  async function fetchProductByBarcode(barcode: string): Promise<FullProduct | null> {
    if (!barcode)
      return null

    isLoading.value = true
    try {
      const { data: singleData, error: singleError } = await supabase
        .from('products')
        .select(`
          *,
          categories(name, slug),
          product_images(*),
          brands(*),
          countries(*),
          materials(*)
        `)
        .eq('barcode', barcode.trim())
        .limit(1)
        .maybeSingle()

      if (singleError)
        throw singleError

      return singleData as FullProduct | null
    }
    catch (error: any) {
      toast.error('Ошибка поиска по штрихкоду', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }
  // --- ЗАПИСЬ ДАННЫХ (Write) ---

  /**
   * ОБНОВЛЕНО: Создает товар, его галерею и связи с аксессуарами.
   */
  async function createProduct(productData: ProductInsert, newImageFiles: File[]) {
    isSaving.value = true
    try {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id, name')
        .single()

      if (error || !newProduct)
        throw error

      // Управляем только картинками
      await _manageProductImages(newProduct.id, newImageFiles, [], 0)

      toast.success(`Товар "${newProduct.name}" успешно создан.`)
      return newProduct
    }
    catch (error: any) {
      toast.error('Ошибка создания товара', { description: error.message })
      return null
    }
    finally {
      isSaving.value = false
    }
  }

  /**
   * Обновляет товар, его галерею и связи с аксессуарами.
   */
  async function updateProduct(
    productId: string,
    productData: ProductUpdate,
    newImageFiles: File[],
    imagesToDelete: string[],
    existingImages: ProductImageRow[],
  ) {
    isSaving.value = true
    try {
      const { data: updatedProduct, error } = await supabase
        .from('products')
        .update(productData) // `productData` уже содержит `accessory_ids`
        .eq('id', productId)
        .select('id, name')
        .single()

      if (error || !updatedProduct)
        throw error

      // Управляем только картинками
      await _manageProductImages(productId, newImageFiles, imagesToDelete, existingImages.length)

      toast.success(`Товар "${updatedProduct.name}" успешно обновлен.`)
      return updatedProduct
    }
    catch (error: any) {
      toast.error('Ошибка обновления товара', { description: error.message })
      return null
    }
    finally {
      isSaving.value = false
    }
  }

  /**
   * Удаляет товар и все связанные с ним изображения.
   */
  async function deleteProduct(productToDelete: ProductListAdmin) {
    // 1. Оптимистичное удаление и сохранение оригинала
    const originalProducts = [...products.value]
    products.value = products.value.filter(p => p.id !== productToDelete.id)

    // 2. Показываем toast.loading
    const toastId = toast.loading(`Удаление товара "${productToDelete.name}"...`, {
      action: {
        label: 'Отмена',
        onClick: () => { // <-- Исправлено на `onClick`
          products.value = originalProducts
          toast.dismiss(toastId)
        },
      },
    })

    try {
      // 3. Сначала удаляем файлы из Storage
      if (productToDelete.product_images && productToDelete.product_images.length > 0) {
        const pathsToRemove = productToDelete.product_images.map(img => img.image_url)
        const success = await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
        if (!success) {
          throw new Error('Не удалось удалить связанные изображения.')
        }
      }

      // 4. Затем удаляем запись из БД
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id)
      if (error)
        throw error

      // 5. Если всё успешно, обновляем toast на "успех"
      toast.success(`Товар "${productToDelete.name}" успешно удален.`, {
        id: toastId,
      })
    }
    catch (error: any) {
      // 6. В случае ошибки, откатываем UI и обновляем toast на "ошибку"
      toast.error('Ошибка удаления товара', {
        id: toastId,
        description: error.message,
      })
      // Восстанавливаем исходный список
      products.value = originalProducts
    }
  }
  // --- Приватные хелперы ---

  async function _manageProductImages(
    productId: string,
    filesToUpload: File[],
    imageIdsToDelete: string[],
    currentImageCount: number,
  ) {
    // 1. Сначала удаляем отмеченные изображения
    if (imageIdsToDelete.length > 0) {
      const { data: deletedImages, error: dbError } = await supabase
        .from('product_images')
        .delete()
        .in('id', imageIdsToDelete)
        .select('image_url')
      if (dbError)
        throw dbError

      const pathsToRemove = deletedImages?.map(img => img.image_url).filter((p): p is string => !!p) || []
      if (pathsToRemove.length > 0)
        await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
    }

    // 2. Затем загружаем и привязываем новые
    if (filesToUpload.length > 0) {
      const uploadPromises = filesToUpload.map(file =>
        uploadFile(file, {
          bucketName: BUCKET_NAME_PRODUCT,
          filePathPrefix: `products/${productId}`,
        }),
      )
      const paths = await Promise.all(uploadPromises)

      const imagesToInsert = paths
        .filter((p): p is string => !!p)
        .map((path, index) => ({
          product_id: productId,
          image_url: path,
          // ВАЖНО: `display_order` начинается после количества уже существующих картинок
          display_order: currentImageCount + index,
        }))

      if (imagesToInsert.length > 0) {
        const { error } = await supabase
          .from('product_images')
          .insert(imagesToInsert)
        if (error)
          throw error
      }
    }
  }
  /**
   * НОВАЯ ФУНКЦИЯ: Поиск товаров для добавления в аксессуары.
   */
  async function searchProducts(query: string, limit: number = 5): Promise<ProductSearchResult[]> {
    if (query.length < 2)
      return []
    try {
    // Шаг 1: Вызываем RPC, чтобы получить все нужные ID категорий
      const { data: categoryData, error: categoryError } = await supabase
        .rpc('get_category_and_children_ids', {
          p_category_slug: 'accessories', // <-- Ищем всех детей 'accessories'
        })

      if (categoryError)
        throw categoryError
      if (!categoryData || categoryData.length === 0) {
        toast.info('Категория \'accessories\' или ее дочерние не найдены.')
        return []
      }

      // Извлекаем ID из результата
      const categoryIds = categoryData.map(c => c.id)

      // Шаг 2: Ищем товары в этом списке категорий
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .in('category_id', categoryIds) // <-- Ищем в массиве ID
        .ilike('name', `%${query}%`)
        .limit(limit)

      if (error)
        throw error
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка поиска аксессуаров', { description: error.message })
      return []
    }
  }

  async function getAttributesForCategory(categoryId: string): Promise<AttributeWithValue[]> {
    // Эта функция загружает атрибуты, привязанные к категории,
    // и сразу подгружает их возможные опции для выбора.
    if (!categoryId)
      return []
    try {
      const { data, error } = await supabase
        .from('attributes')
        .select(`
          *,
          attribute_options(*),
          category_attributes!inner(category_id)
        `)
        .eq('category_attributes.category_id', categoryId)

      if (error)
        throw error
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки атрибутов для категории', { description: error.message })
      return []
    }
  }

  async function getProductAttributeValues(productId: string) {
    // Загружает уже сохраненные значения атрибутов для конкретного товара
    try {
      const { data, error } = await supabase
        .from('product_attribute_values')
        .select('*')
        .eq('product_id', productId)
      if (error)
        throw error
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки значений атрибутов товара', { description: error.message })
      return []
    }
  }

  async function saveProductAttributeValues(productId: string, values: ProductAttributeValueInsert[]) {
    try {
      // 1. Удаляем все старые значения для этого товара
      const { error: deleteError } = await supabase
        .from('product_attribute_values')
        .delete()
        .eq('product_id', productId)
      if (deleteError)
        throw deleteError

      // 2. Вставляем новые значения (только те, что были выбраны)
      const valuesToInsert = values
        .filter(v => v.option_id != null) // Вставляем только если есть значение
        .map(v => ({ ...v, product_id: productId }))

      if (valuesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('product_attribute_values')
          .insert(valuesToInsert)
        if (insertError)
          throw insertError
      }
    }
    catch (error: any) {
      toast.error('Ошибка сохранения атрибутов товара', { description: error.message })
    }
  }
  return {
    products,
    currentProduct,
    brands,
    countries,
    materials,
    isLoading,
    isSaving,
    fetchProducts,
    fetchProductById,
    fetchProductBySku,
    fetchAllBrands,
    fetchAllCountries,
    fetchAllMaterials,
    fetchProductByBarcode,
    createProduct,
    updateProduct,
    deleteProduct,
    fetchProductsByIds,
    searchProducts,
    getAttributesForCategory,
    getProductAttributeValues,
    saveProductAttributeValues,
  }
})
