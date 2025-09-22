import type { Database, ProductTypeRow } from '@/types'
import { toast } from 'vue-sonner'

export const useAdminProductTypesStore = defineStore('productTypesStore', () => {
  const supabase = useSupabaseClient<Database>()

  const productType = ref<ProductTypeRow[]>([])
  const isLoading = ref(false)

  async function fetchAllProductTypes() {
    if (productType.value.length > 0)
      return
    isLoading.value = true

    try {
      const { data, error } = await supabase
        .from('product_types')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true })

      if (error)
        throw error
      productType.value = (data as ProductTypeRow[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки типов товаров', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    productType,
    isLoading,
    fetchAllProductTypes,
  }
})
