import type { Database, FullProduct, ProductImageRow, ProductInsert, ProductSearchResult, ProductUpdate } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  // --- СОСТОЯНИЕ (State) ---
  const products = ref<FullProduct[]>([])
  const currentProduct = ref<FullProduct | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)

  // --- ЧТЕНИЕ ДАННЫХ (Read) ---

  async function fetchProducts() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug), product_images(*)')
        .order('created_at', { ascending: false })
      if (error)
        throw error
      products.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки товаров', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchProductById(id: string) {
    isLoading.value = true
    currentProduct.value = null // Сбрасываем, чтобы избежать показа старых данных
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
        *,
        categories(name, slug),
        product_images(*),
        product_accessories(
          *,
          accessory:products(
            *,
            product_images(*)
          )
        )
      `)
        .eq('id', id)
        .single()
      if (error)
        throw error
      currentProduct.value = data as unknown as FullProduct
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара с ID: ${id}`, { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  // --- ЗАПИСЬ ДАННЫХ (Write) ---

  /**
   * ОБНОВЛЕНО: Создает товар, его галерею и связи с аксессуарами.
   */
  async function createProduct(productData: ProductInsert, newImageFiles: File[], accessoryIds: string[]) {
    isSaving.value = true
    try {
      // 1. Создаем основную запись о товаре
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select('id, name')
        .single()
      if (error || !newProduct)
        throw error

      // 2. Параллельно запускаем загрузку картинок и сохранение аксессуаров
      await Promise.all([
        _manageProductImages(newProduct.id, newImageFiles, [], 0),
        _manageProductAccessories(newProduct.id, accessoryIds),
      ])

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
    accessoryIds: string[],
  ) {
    isSaving.value = true
    try {
      // 1. Обновляем основную запись
      const { data: updatedProduct, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', productId)
        .select('id, name')
        .single()
      if (error || !updatedProduct)
        throw error

      // 2. Параллельно обновляем картинки и аксессуары
      await Promise.all([
        _manageProductImages(productId, newImageFiles, imagesToDelete, existingImages.length),
        _manageProductAccessories(productId, accessoryIds),
      ])

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
  async function deleteProduct(productToDelete: FullProduct) {
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
   * НОВЫЙ ХЕЛПЕР: Управляет связями товара с аксессуарами.
   */
  async function _manageProductAccessories(mainProductId: string, newAccessoryIds: string[]) {
    // 1. Получаем текущие связи для этого товара
    const { data: currentLinks, error: fetchError } = await supabase
      .from('product_accessories')
      .select('accessory_product_id')
      .eq('main_product_id', mainProductId)
    if (fetchError)
      throw fetchError
    const currentAccessoryIds = currentLinks.map(link => link.accessory_product_id)

    // 2. Находим ID, которые нужно удалить (есть в старом списке, но нет в новом)
    const idsToDelete = currentAccessoryIds.filter(id => !newAccessoryIds.includes(id))
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('product_accessories')
        .delete()
        .eq('main_product_id', mainProductId)
        .in('accessory_product_id', idsToDelete)
      if (deleteError)
        throw deleteError
    }

    // 3. Находим ID, которые нужно добавить (есть в новом списке, но нет в старом)
    const idsToInsert = newAccessoryIds.filter(id => !currentAccessoryIds.includes(id))
    if (idsToInsert.length > 0) {
      const linksToInsert = idsToInsert.map(accId => ({
        main_product_id: mainProductId,
        accessory_product_id: accId,
      }))
      const { error: insertError } = await supabase
        .from('product_accessories')
        .insert(linksToInsert)
      if (insertError)
        throw insertError
    }
  }
  /**
   * НОВАЯ ФУНКЦИЯ: Поиск товаров для добавления в аксессуары.
   */
  async function searchProducts(query: string, limit: number = 5): Promise<ProductSearchResult[]> {
    if (query.length < 2)
      return []
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .ilike('name', `%${query}%`)
        .limit(limit)
      if (error)
        throw error
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка поиска товаров', { description: error.message })
      return []
    }
  }

  return {
    products,
    currentProduct,
    searchProducts,
    isLoading,
    isSaving,
    fetchProducts,
    fetchProductById,
    createProduct,
    updateProduct,
    deleteProduct,
  }
})
