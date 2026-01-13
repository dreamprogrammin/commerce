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
import { formatFileSize, generateBlurPlaceholder, optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'

// 🆕 Интерфейс для изображения с blur
interface ImageWithBlur {
  file: File
  blurDataUrl?: string
}

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  // --- SEO: Уведомление поисковиков о новых страницах ---
  async function notifySearchEngines(productSlug: string) {
    try {
      const url = `/catalog/products/${productSlug}`
      await $fetch('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls: [url], type: 'created' },
      })
      // Уведомление успешно отправлено
    }
    catch {
      // Не блокируем основной флоу если SEO уведомление не прошло
    }
  }

  // --- СОСТОЯНИЕ (State) ---
  const products = ref<ProductListAdmin[]>([])
  const currentProduct = ref<FullProduct | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const brands = ref<Brand[]>([])
  const countries = ref<Country[]>([])
  const materials = ref<Material[]>([])

  // --- ЧТЕНИЕ ДАННЫХ (Read) ---

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
   * 🆕 Создает товар с поддержкой blur placeholder
   */
  async function createProduct(
    productData: ProductInsert,
    newImageFiles: ImageWithBlur[], // 🎯 Изменено: принимаем blur
  ) {
    isSaving.value = true
    try {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id, name, slug')
        .single()

      if (error || !newProduct)
        throw error

      // 🎯 Управляем картинками с blur
      await _manageProductImages(newProduct.id, newImageFiles, [], 0)

      // 🔍 SEO: Уведомляем поисковики о новом товаре
      if (newProduct.slug) {
        notifySearchEngines(newProduct.slug)
      }

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
   * 🆕 Обновляет товар с поддержкой blur placeholder
   */
  async function updateProduct(
    productId: string,
    productData: ProductUpdate,
    newImageFiles: ImageWithBlur[], // 🎯 Изменено: принимаем blur
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

      // 🎯 Управляем картинками с blur
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
   * 🎯 ОБНОВЛЕНО: Управление изображениями с поддержкой blur placeholder
   *
   * Обрабатывает файлы в зависимости от режима:
   * - Бесплатный: локально оптимизирует + генерирует blur
   * - Платный: загружает оригиналы + генерирует blur
   */
  async function _manageProductImages(
    productId: string,
    imagesToUpload: ImageWithBlur[], // 🎯 Изменено: принимаем blur
    imageIdsToDelete: string[],
    currentImageCount: number,
  ) {
    // 1️⃣ Удаляем отмеченные изображения
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

    // 2️⃣ Обрабатываем и загружаем новые изображения
    if (imagesToUpload.length > 0) {
      for (let i = 0; i < imagesToUpload.length; i++) {
        const { file, blurDataUrl } = imagesToUpload[i]

        // 🎯 Оптимизация если нужно (бесплатный тариф)
        let fileToUpload = file
        let finalBlur = blurDataUrl

        if (!IMAGE_OPTIMIZATION_ENABLED && shouldOptimizeImage(file)) {
          try {
            const result = await optimizeImageBeforeUpload(file)
            fileToUpload = result.file
            finalBlur = result.blurPlaceholder || blurDataUrl // Используем blur из оптимизации

            console.log(
              `✅ Оптимизирован: ${file.name} (${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)}) + ${finalBlur ? 'LQIP ✨' : 'no blur'}`,
            )
          }
          catch (error) {
            console.warn(`⚠️ Ошибка оптимизации ${file.name}, загружаем оригинал:`, error)
          }
        }

        // 🆕 Если blur нет, генерируем его
        if (!finalBlur) {
          try {
            const blurResult = await generateBlurPlaceholder(file)
            finalBlur = blurResult.dataUrl
            console.log(`✨ Blur сгенерирован для ${file.name}`)
          }
          catch (error) {
            console.warn(`⚠️ Не удалось сгенерировать blur для ${file.name}:`, error)
          }
        }

        // 3️⃣ Загружаем файл в Storage
        const filePath = await uploadFile(fileToUpload, {
          bucketName: BUCKET_NAME_PRODUCT,
          filePathPrefix: `products/${productId}`,
        })

        if (!filePath) {
          console.error(`❌ Не удалось загрузить ${file.name}`)
          continue
        }

        // 4️⃣ Сохраняем в БД С blur_placeholder
        const { error: imageError } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            image_url: filePath,
            display_order: currentImageCount + i,
            blur_placeholder: finalBlur || null, // 🎯 СОХРАНЯЕМ BLUR
          })

        if (imageError) {
          console.error(`❌ Ошибка сохранения метаданных изображения:`, imageError)
        }
        else {
          console.log(`✅ Сохранено изображение с blur (${finalBlur ? finalBlur.length : 0} chars)`)
        }
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
