import type { Database, FullProduct, ProductInsert, ProductRow, ProductUpdate, ProductWithCategory } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

type ProductUpsert = ProductUpdate & {
  name: string
  slug: string
  price: number
}

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

  async function upsertProduct(
    productData: ProductUpsert,
    imageFiles: File[],
    imagesToDelete: string[] = [],
  ) {
    isSaving.value = true
    try {
      const { data: product, error: productError } = await supabase
        .from('products')
        .upsert(productData)
        .select()
        .single()
      if (productError)
        throw productError

      const productId = product.id

      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map(file => uploadFile(file, {
          bucketName: BUCKET_NAME_PRODUCT,
          filePathPrefix: `products/${productId}`,
        }))

        const paths = await Promise.all(uploadPromises)

        const imagesToInsert = paths
          .filter((path): path is string => !!path)
          .map((path, index) => ({
            product_id: productId,
            image_url: path,
            display_order: index,
          }))

        if (imagesToInsert.length > 0) {
          const { error: imagesError } = await supabase
            .from('product_images')
            .insert(imagesToInsert)
          if (imagesError)
            throw imagesError
        }
      }
      if (imagesToDelete.length > 0) {
        const { data: deletedImages, error: deleteDbError } = await supabase
          .from('product_images')
          .delete()
          .in('id', imagesToDelete)
          .select('image_url')

        if (deleteDbError)
          throw deleteDbError

        const pathsToRemove = deletedImages.map(img => img.image_url)

        if (pathsToRemove.length > 0) {
          await removeFile(BUCKET_NAME_PRODUCT, pathsToRemove)
        }
      }
      toast.success(`Товар "${product.name}" успешно сохранен.`)
      return product
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
    upsertProduct,
  }
})
