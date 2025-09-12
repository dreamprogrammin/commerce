import type { Database, FullProduct, ProductInsert, ProductRow, ProductUpdate, ProductWithCategory } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  const products = ref<FullProduct[]>([])
  const currentProduct = ref<FullProduct | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)

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

  async function createProduct(productData: ProductInsert, imageFile?: File | null): Promise<ProductRow | null> {
    isLoading.value = true
    try {
      if (imageFile) {
        const path = await uploadFile(imageFile, {
          bucketName: 'product-images',
          filePathPrefix: `products/${productData.slug || 'product'}`,
        })
        if (!path)
          throw new Error('Ошибка загрузки изображения.')
        productData.image_url = path
      }

      const { data, error } = await supabase
        .from('products')
        .insert(productData)
        .select()
        .single()

      if (error)
        throw error
      toast.success(`Товар "${data.name}" успешно создан.`)
      return data
    }
    catch (error: any) {
      toast.error('Ошибка создания товара', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function updateProduct(productId: string, updates: ProductUpdate, imageFile?: File | null): Promise<ProductRow | null> {
    isLoading.value = true
    try {
      if (imageFile) {
        const path = await uploadFile(imageFile, {
          bucketName: 'product-images',
          filePathPrefix: `products/${updates.slug || 'product'}`,
        })
        if (!path)
          throw new Error('Ошибка загрузки изображения.')
        updates.image_url = path
      }

      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single()

      if (error)
        throw error
      toast.success(`Товар "${data.name}" успешно обновлен.`)
      return data
    }
    catch (error: any) {
      toast.error('Ошибка обновления товара', { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function deleteProduct(productToDelete: FullProduct) {
    // eslint-disable-next-line no-alert
    if (!confirm(`Вы уверены, что хотите удалить товар "${productToDelete.name}"?`))
      return

    isLoading.value = true
    try {
      if (productToDelete.product_images && productToDelete.product_images.length > 0) {
        const pathsToRemove = productToDelete.product_images.map(img => img.image_url)
        await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
      }
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id)

      if (error)
        throw error
      toast.success(`Товар "${productToDelete.name}" удален.`)
      products.value = products.value.filter(p => p.id !== productToDelete.id)
    }
    catch (error: any) {
      toast.error('Ошибка удаления товара', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Универсальная функция для создания И обновления товара и его галереи.
   * @param productData - Данные из формы. Должен содержать `id` для обновления.
   * @param newImageFiles - Массив новых файлов для загрузки.
   * @param imagesToDelete - Массив ID существующих изображений для удаления.
   */

  async function saveProduct(
    productData: ProductInsert | ProductUpdate,
    newImageFiles: File[],
    imagesToDelete: string[] = [],
  ) {
    isSaving.value = true
    try {
      let savedProduct: { id: string, name: string }

      if ('id' in productData && productData.id) {
        // --- РЕЖИМ ОБНОВЛЕНИЯ ---
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productData.id)
          .select('id, name')
          .single()
        if (error)
          throw error
        savedProduct = data
      }
      else {
        // --- РЕЖИМ СОЗДАНИЯ ---
        const { data, error } = await supabase
          .from('products')
          .insert(productData as ProductInsert)
          .select('id, name')
          .single()
        if (error)
          throw error
        savedProduct = data
      }

      const productId = savedProduct.id

      // --- ЛОГИКА РАБОТЫ С ИЗОБРАЖЕНИЯМИ ---

      // 1. Удаляем отмеченные изображения
      if (imagesToDelete.length > 0) {
        const { data: deletedImages, error: deleteDbError } = await supabase
          .from('product_images')
          .delete()
          .in('id', imagesToDelete)
          .select('image_url')
        if (deleteDbError)
          throw deleteDbError

        const pathsToRemove = deletedImages.map(img => img.image_url).filter((p): p is string => !!p)
        if (pathsToRemove.length > 0)
          await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
      }

      // 2. Загружаем новые изображения
      if (newImageFiles.length > 0) {
        // Получаем текущее максимальное значение display_order для этого товара
        const { data: maxOrder, error: orderError } = await supabase
          .from('product_images')
          .select('display_order')
          .eq('product_id', productId)
          .order('display_order', { ascending: false })
          .limit(1)
          .single()
        if (orderError && orderError.code !== 'PGRST116')
          throw orderError
        const currentMaxOrder = maxOrder?.display_order ?? -1

        // Загружаем файлы
        const uploadPromises = newImageFiles.map(file => uploadFile(file, {
          bucketName: BUCKET_NAME_PRODUCT,
          filePathPrefix: `products/${productId}`,
        }))
        const paths = await Promise.all(uploadPromises)

        // Готовим записи для вставки в БД
        const imagesToInsert = paths
          .filter((path): path is string => !!path)
          .map((path, index) => ({
            product_id: productId,
            image_url: path,
            display_order: currentMaxOrder + 1 + index, // Правильно устанавливаем порядок
          }))

        if (imagesToInsert.length > 0) {
          const { error: imagesError } = await supabase.from('product_images').insert(imagesToInsert)
          if (imagesError)
            throw imagesError
        }
      }

      toast.success(`Товар "${savedProduct.name}" успешно сохранен.`)
      return savedProduct
    }
    catch (error: any) {
      toast.error('Ошибка сохранения товара', { description: error.message })
      return null
    }
    finally {
      isSaving.value = false
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
    saveProduct,
  }
})
