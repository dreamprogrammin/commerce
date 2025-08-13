import type { Database, ProductInsert, ProductRow, ProductUpdate, ProductWithCategory } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

export const useAdminProductsStore = defineStore('adminProductsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const { uploadFile, removeFile } = useSupabaseStorage()

  const products = ref<ProductWithCategory[]>([])
  const currentProduct = ref<ProductRow | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)

  async function fetchProducts() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name)')
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
        .select('*')
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

  async function deleteProduct(productToDelete: ProductWithCategory) {
    // eslint-disable-next-line no-alert
    if (!confirm(`Вы уверены, что хотите удалить товар "${productToDelete.name}"?`))
      return
    try {
      if (productToDelete.image_url) {
        await removeFile('product-images', productToDelete.image_url)
      }
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete.id)

      if (error)
        throw error
      toast.success(`Товар "${productToDelete.name}" удален.`)
      await fetchProducts()
    }
    catch (error: any) {
      toast.error('Ошибка удаления товара', { description: error.message })
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
