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
import { IMAGE_OPTIMIZATION_ENABLED } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { formatFileSize, optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'

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
          materials(*)`,
        )
        .order('created_at', { ascending: false })
      if (error)
        throw error
      products.value = (data as ProductListAdmin[]) || []
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
    currentProduct.value = null
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

      currentProduct.value = data as FullProduct | null

      return data as FullProduct | null
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара с ID: ${id}`, { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

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
      return []
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*)')
        .in('id', ids)

      if (error)
        throw error

      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки связанных товаров', { description: error.message })
      return []
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
   * Создает товар, его галерею и связи с аксессуарами.
   */
  async function createProduct(
    productData: ProductInsert,
    newImageFiles: File[],
  ) {
    isSaving.value = true
    try {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id, name')
        .single()

      if (error || !newProduct)
        throw error

      // 🎯 Управляем картинками с оптимизацией
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
        .update(productData)
        .eq('id', productId)
        .select('id, name')
        .single()

      if (error || !updatedProduct)
        throw error

      // 🎯 Управляем картинками с оптимизацией
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
    const originalProducts = [...products.value]
    products.value = products.value.filter(p => p.id !== productToDelete.id)

    const toastId = toast.loading(`Удаление товара "${productToDelete.name}"...`, {
      action: {
        label: 'Отмена',
        onClick: () => {
          products.value = originalProducts
          toast.dismiss(toastId)
        },
      },
    })

    try {
      if (productToDelete.product_images && productToDelete.product_images.length > 0) {
        const pathsToRemove = productToDelete.product_images.map(img => img.image_url)
        const success = await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
        if (!success) {
          throw new Error('Не удалось удалить связанные изображения.')
        }
      }

      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id)
      if (error)
        throw error

      toast.success(`Товар "${productToDelete.name}" успешно удален.`, {
        id: toastId,
      })
    }
    catch (error: any) {
      toast.error('Ошибка удаления товара', {
        id: toastId,
        description: error.message,
      })
      products.value = originalProducts
    }
  }

  // --- Приватные хелперы ---

  /**
   * 🎯 ОБНОВЛЕНО: Управление изображениями с поддержкой оптимизации
   *
   * Теперь обрабатывает файлы в зависимости от режима:
   * - Бесплатный (IMAGE_OPTIMIZATION_ENABLED = false): локально оптимизирует
   * - Платный (IMAGE_OPTIMIZATION_ENABLED = true): загружает оригиналы
   */
  async function _manageProductImages(
    productId: string,
    filesToUpload: File[],
    imageIdsToDelete: string[],
    currentImageCount: number,
  ) {
    // 1️⃣ Сначала удаляем отмеченные изображения
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

    // 2️⃣ Затем обрабатываем и загружаем новые изображения
    if (filesToUpload.length > 0) {
      const processedFiles = await Promise.all(
        filesToUpload.map(async (file) => {
          // 🎯 РЕЖИМ 1: Бесплатный тариф - локально оптимизируем
          if (!IMAGE_OPTIMIZATION_ENABLED && shouldOptimizeImage(file)) {
            try {
              const result = await optimizeImageBeforeUpload(file)
              console.warn(
                `✅ Оптимизирован: ${file.name} (${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)})`,
              )
              return result.file
            }
            catch (error) {
              console.warn(`⚠️ Ошибка оптимизации ${file.name}, загружаем оригинал:`, error)
              return file
            }
          }

          // 🎯 РЕЖИМ 2: Платный тариф или маленький файл - загружаем как есть
          return file
        }),
      )

      // 3️⃣ Загружаем обработанные файлы в Supabase
      const uploadPromises = processedFiles.map(file =>
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
   * Поиск товаров для добавления в аксессуары.
   */
  async function searchProducts(query: string, limit: number = 5): Promise<ProductSearchResult[]> {
    if (query.length < 2)
      return []
    try {
      const { data: categoryData, error: categoryError } = await supabase
        .rpc('get_category_and_children_ids', {
          p_category_slug: 'accessories',
        })

      if (categoryError)
        throw categoryError
      if (!categoryData || categoryData.length === 0) {
        toast.info('Категория \'accessories\' или ее дочерние не найдены.')
        return []
      }

      const categoryIds = categoryData.map(c => c.id)

      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .in('category_id', categoryIds)
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
      const { error: deleteError } = await supabase
        .from('product_attribute_values')
        .delete()
        .eq('product_id', productId)
      if (deleteError)
        throw deleteError

      const valuesToInsert = values
        .filter(v => v.option_id != null)
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
