import type { Database } from '@/types'
import { toast } from 'vue-sonner'

interface PromoCampaign {
  id: string
  title: string
  slug: string
  description: string | null
  source_type: 'category' | 'brand'
  category_id: string | null
  brand_id: string | null
  discount_percentage: number
  is_active: boolean
  created_at: string
  created_by: string | null
}

interface PromoProduct {
  id: string
  name: string
  slug: string
  price: number
  discount_percentage: number
  stock_quantity: number | null
  product_images: { image_url: string | null }[] | null
}

export const useAdminPromotionsStore = defineStore('adminPromotionsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const campaigns = ref<PromoCampaign[]>([])
  const products = ref<PromoProduct[]>([])
  const isLoading = ref(false)
  const isLoadingProducts = ref(false)
  const isSaving = ref(false)

  async function fetchCampaigns() {
    isLoading.value = true
    try {
      const { data, error } = await supabase
        .from('promo_campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (error)
        throw error
      campaigns.value = (data ?? []) as PromoCampaign[]
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error fetching campaigns:', error)
      toast.error('Ошибка загрузки акций')
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchProductsByCategory(categoryId: string) {
    isLoadingProducts.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, price, discount_percentage, stock_quantity, product_images(image_url)')
        .eq('category_id', categoryId)
        .order('name', { ascending: true })

      if (error)
        throw error
      products.value = (data ?? []) as unknown as PromoProduct[]
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error fetching products by category:', error)
      toast.error('Ошибка загрузки товаров')
    }
    finally {
      isLoadingProducts.value = false
    }
  }

  async function fetchProductsByBrand(brandId: string) {
    isLoadingProducts.value = true
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, slug, price, discount_percentage, stock_quantity, product_images(image_url)')
        .eq('brand_id', brandId)
        .order('name', { ascending: true })

      if (error)
        throw error
      products.value = (data ?? []) as unknown as PromoProduct[]
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error fetching products by brand:', error)
      toast.error('Ошибка загрузки товаров')
    }
    finally {
      isLoadingProducts.value = false
    }
  }

  async function createCampaign(data: {
    title: string
    slug: string
    description: string
    sourceType: 'category' | 'brand'
    categoryId: string | null
    brandId: string | null
    discountPercentage: number
    productIds: string[]
  }): Promise<string | null> {
    isSaving.value = true
    try {
      // eslint-disable-next-line ts/no-unsafe-function-type
      const { data: campaignId, error } = await (supabase.rpc as Function)('create_promo_campaign', {
        p_title: data.title,
        p_slug: data.slug,
        p_description: data.description,
        p_source_type: data.sourceType,
        p_category_id: data.categoryId,
        p_brand_id: data.brandId,
        p_discount_percentage: data.discountPercentage,
        p_product_ids: data.productIds,
      })

      if (error)
        throw error

      toast.success('Акция создана! Скидки применены к товарам.')
      await fetchCampaigns()
      return campaignId as string
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error creating campaign:', error)
      toast.error('Ошибка создания акции', { description: error.message })
      return null
    }
    finally {
      isSaving.value = false
    }
  }

  async function deactivateCampaign(campaignId: string): Promise<boolean> {
    isSaving.value = true
    try {
      // eslint-disable-next-line ts/no-unsafe-function-type
      const { error } = await (supabase.rpc as Function)('deactivate_promo_campaign', {
        p_campaign_id: campaignId,
      })

      if (error)
        throw error

      toast.success('Акция завершена. Скидки восстановлены.')
      await fetchCampaigns()
      return true
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error deactivating campaign:', error)
      toast.error('Ошибка завершения акции', { description: error.message })
      return false
    }
    finally {
      isSaving.value = false
    }
  }

  async function sendPromoNotification(params: {
    message: string
    title?: string
    link?: string
  }): Promise<boolean> {
    try {
      const { data, error } = await supabase.functions.invoke('send-broadcast', {
        body: {
          message: params.message,
          title: params.title,
          link: params.link,
        },
      })

      if (error)
        throw error

      const parts: string[] = []
      if (data.sent_count > 0)
        parts.push(`Telegram: ${data.sent_count}`)
      if (data.notified_count > 0)
        parts.push(`In-app: ${data.notified_count}`)

      toast.success(`Уведомление отправлено: ${parts.join(', ')}`, {
        description: data.failed_count > 0 ? `Не удалось: ${data.failed_count}` : undefined,
      })
      return true
    }
    catch (error: any) {
      console.error('[PromotionsStore] Error sending notification:', error)
      toast.error('Ошибка отправки уведомления', { description: error.message })
      return false
    }
  }

  return {
    campaigns,
    products,
    isLoading,
    isLoadingProducts,
    isSaving,
    fetchCampaigns,
    fetchProductsByCategory,
    fetchProductsByBrand,
    createCampaign,
    deactivateCampaign,
    sendPromoNotification,
  }
})
