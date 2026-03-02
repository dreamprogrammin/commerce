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
  ProductLine,
  ProductListAdmin,
  ProductSearchResult,
  ProductUpdate,
  ProductWithImages,
} from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_VARIANTS } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { formatFileSize, generateBlurPlaceholder, generateImageVariants, optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'

// 🆕 Интерфейс для изображения с blur
interface ImageWithBlur {
  file: File
  blurDataUrl?: string
}

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile, generateSeoFileName } = useSupabaseStorage()

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
  const productLines = ref<ProductLine[]>([])
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

  async function fetchAllProductLines() {
    try {
      const { data, error } = await supabase
        .from('product_lines')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      productLines.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки линеек продуктов', { description: error.message })
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
        product_lines(*),
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

      // 🎯 Управляем картинками с blur (🔍 SEO: передаём имя товара для названия файлов)
      await _manageProductImages(newProduct.id, newProduct.name, newImageFiles, [], 0, [])

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
        .select('id, name, slug')
        .single()

      if (error || !updatedProduct)
        throw error

      // 🎯 Управляем картинками с blur (🔍 SEO: передаём имя товара для названия файлов)
      await _manageProductImages(productId, updatedProduct.name, newImageFiles, imagesToDelete, existingImages.length, existingImages)

      // 🔍 SEO: Уведомляем поисковики об обновлённом товаре
      if (updatedProduct.slug) {
        notifySearchEngines(updatedProduct.slug)
      }

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
        const pathsToRemove = productToDelete.product_images.flatMap(img => _getVariantPaths(img.image_url))
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
   * Проверяет, является ли image_url старым форматом (с расширением файла)
   */
  function _isLegacyImagePath(imageUrl: string): boolean {
    return /\.\w{3,4}$/.test(imageUrl)
  }

  /**
   * Возвращает пути всех вариантов для удаления из Storage
   */
  function _getVariantPaths(imageUrl: string): string[] {
    if (_isLegacyImagePath(imageUrl)) {
      return [imageUrl]
    }
    return Object.values(IMAGE_VARIANTS).map(v => `${imageUrl}${v.suffix}.webp`)
  }

  /**
   * 🎯 Управление изображениями с поддержкой вариантов (sm/md/lg)
   *
   * Генерирует 3 варианта каждого изображения для адаптивной загрузки.
   * В БД сохраняется базовый путь без расширения.
   * На платном тарифе загружает оригиналы + генерирует blur.
   */
  async function _manageProductImages(
    productId: string,
    productName: string | undefined,
    imagesToUpload: ImageWithBlur[],
    imageIdsToDelete: string[],
    currentImageCount: number,
    existingImages: ProductImageRow[] = [],
  ) {
    // 1️⃣ Удаляем отмеченные изображения (все варианты)
    if (imageIdsToDelete.length > 0) {
      const { data: deletedImages, error: dbError } = await supabase
        .from('product_images')
        .delete()
        .in('id', imageIdsToDelete)
        .select('image_url')
      if (dbError)
        throw dbError

      const pathsToRemove = (deletedImages || [])
        .filter((img): img is { image_url: string } => !!img.image_url)
        .flatMap(img => _getVariantPaths(img.image_url))
      if (pathsToRemove.length > 0)
        await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
    }

    // 2️⃣ Обновляем display_order для существующих изображений
    if (existingImages.length > 0) {
      for (let i = 0; i < existingImages.length; i++) {
        const { error: updateError } = await supabase
          .from('product_images')
          .update({ display_order: i })
          .eq('id', existingImages[i].id)

        if (updateError) {
          console.error(`❌ Ошибка обновления порядка изображения ${existingImages[i].id}:`, updateError)
        }
      }
    }

    // 3️⃣ Обрабатываем и загружаем новые изображения
    if (imagesToUpload.length > 0) {
      const filePathPrefix = `products/${productId}`

      for (let i = 0; i < imagesToUpload.length; i++) {
        const { file, blurDataUrl } = imagesToUpload[i]

        if (IMAGE_OPTIMIZATION_ENABLED) {
          // === ПЛАТНЫЙ ТАРИФ: загружаем оригинал, Supabase трансформирует на лету ===
          let finalBlur = blurDataUrl
          if (!finalBlur) {
            try {
              const blurResult = await generateBlurPlaceholder(file)
              finalBlur = blurResult.dataUrl
            }
            catch (error) {
              console.warn(`⚠️ Не удалось сгенерировать blur для ${file.name}:`, error)
            }
          }

          const filePath = await uploadFile(file, {
            bucketName: BUCKET_NAME_PRODUCT,
            filePathPrefix,
            seoName: productName ? `product-${productName}` : undefined,
          })

          if (!filePath) {
            console.error(`❌ Не удалось загрузить ${file.name}`)
            continue
          }

          const { error: imageError } = await supabase
            .from('product_images')
            .insert({
              product_id: productId,
              image_url: filePath,
              display_order: existingImages.length + i,
              blur_placeholder: finalBlur || null,
            })

          if (imageError)
            console.error(`❌ Ошибка сохранения метаданных изображения:`, imageError)
        }
        else {
          // === БЕСПЛАТНЫЙ ТАРИФ: генерируем 3 варианта (sm/md/lg) ===
          try {
            const variants = await generateImageVariants(file)
            const finalBlur = variants.blurPlaceholder || blurDataUrl

            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log(
                `✅ Варианты: ${file.name} (${formatFileSize(variants.originalSize)} → sm:${formatFileSize(variants.sm.size)}, md:${formatFileSize(variants.md.size)}, lg:${formatFileSize(variants.lg.size)}) + ${finalBlur ? 'LQIP ✨' : 'no blur'}`,
              )
            }

            // Генерируем базовое SEO-имя без расширения
            const seoName = productName ? `product-${productName}` : undefined
            const baseSeoName = generateSeoFileName(file, seoName).replace(/\.[^.]+$/, '')

            // Загружаем 3 файла параллельно
            const uploadResults = await Promise.all(
              (['sm', 'md', 'lg'] as const).map(variant =>
                uploadFile(variants[variant], {
                  bucketName: BUCKET_NAME_PRODUCT,
                  filePathPrefix,
                  customFileName: `${baseSeoName}${IMAGE_VARIANTS[variant].suffix}.webp`,
                }),
              ),
            )

            // Проверяем что хотя бы один загрузился
            const anyFailed = uploadResults.some(r => !r)
            if (anyFailed) {
              console.warn(`⚠️ Некоторые варианты не загрузились для ${file.name}`)
            }

            // Все загружены — нет пути? пропускаем
            if (!uploadResults[0]) {
              console.error(`❌ Не удалось загрузить sm-вариант ${file.name}`)
              continue
            }

            // В БД сохраняем базовый путь без суффикса и расширения
            const basePath = `${filePathPrefix}/${baseSeoName}`

            const { error: imageError } = await supabase
              .from('product_images')
              .insert({
                product_id: productId,
                image_url: basePath,
                display_order: existingImages.length + i,
                blur_placeholder: finalBlur || null,
              })

            if (imageError) {
              console.error(`❌ Ошибка сохранения метаданных изображения:`, imageError)
            }
            else if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.log(`✅ Сохранено изображение (base: ${basePath}) с blur (${finalBlur ? finalBlur.length : 0} chars)`)
            }
          }
          catch (error) {
            console.warn(`⚠️ Ошибка генерации вариантов ${file.name}, загружаем как раньше:`, error)

            // Fallback: загружаем как раньше (один файл)
            let fileToUpload = file
            let finalBlur = blurDataUrl

            if (shouldOptimizeImage(file)) {
              try {
                const result = await optimizeImageBeforeUpload(file)
                fileToUpload = result.file
                finalBlur = result.blurPlaceholder || blurDataUrl
              }
              catch {
                // используем оригинал
              }
            }

            if (!finalBlur) {
              try {
                const blurResult = await generateBlurPlaceholder(file)
                finalBlur = blurResult.dataUrl
              }
              catch {
                // продолжаем без blur
              }
            }

            const filePath = await uploadFile(fileToUpload, {
              bucketName: BUCKET_NAME_PRODUCT,
              filePathPrefix,
              seoName: productName ? `product-${productName}` : undefined,
            })

            if (!filePath) {
              console.error(`❌ Не удалось загрузить ${file.name}`)
              continue
            }

            const { error: imageError } = await supabase
              .from('product_images')
              .insert({
                product_id: productId,
                image_url: filePath,
                display_order: existingImages.length + i,
                blur_placeholder: finalBlur || null,
              })

            if (imageError)
              console.error(`❌ Ошибка сохранения метаданных изображения:`, imageError)
          }
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

      // Фильтруем только значения с option_id ИЛИ numeric_value
      const valuesToInsert = values
        .filter(v => v.option_id != null || v.numeric_value != null)
        .map(v => ({
          product_id: productId,
          attribute_id: v.attribute_id,
          option_id: v.option_id ?? null,
          numeric_value: v.numeric_value ?? null,
        }))

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
    productLines,
    countries,
    materials,
    isLoading,
    isSaving,
    fetchProducts,
    fetchProductById,
    fetchProductBySku,
    fetchAllBrands,
    fetchAllProductLines,
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
