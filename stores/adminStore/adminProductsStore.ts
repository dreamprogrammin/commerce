import type { Database, FullProduct, ProductImageRow, ProductInsert, ProductUpdate } from '@/types'
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
        .select('*, categories(name, slug), product_images(*)')
        .eq('id', id)
        .single()
      if (error)
        throw error
      currentProduct.value = data
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
   * Создает новый товар и его галерею.
   */
  async function createProduct(productData: ProductInsert, newImageFiles: File[]) {
    isSaving.value = true
    try {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()
      if (error)
        throw error

      // Для нового товара `imagesToDelete` всегда пустой, а `existingImageCount` равен 0.
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
   * Обновляет существующий товар и его галерею.
   */
  async function updateProduct(
    productId: string,
    productData: ProductUpdate,
    newImageFiles: File[],
    imagesToDelete: string[],
    existingImages: ProductImageRow[], // <-- Принимаем сюда актуальные данные
  ) {
    isSaving.value = true
    try {
      const { data: updatedProduct, error } = await supabase
        .from('products')
        .update(productData)
        .eq('id', productId)
        .select()
        .single()
      if (error)
        throw error

      // Передаем в хелпер ID, новые файлы, ID на удаление и КОЛИЧЕСТВО существующих картинок
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

  return {
    products,
    currentProduct,
    isLoading,
    isSaving,
    fetchProducts,
    fetchProductById,
    createProduct,
    updateProduct,
    deleteProduct,
  }
})
