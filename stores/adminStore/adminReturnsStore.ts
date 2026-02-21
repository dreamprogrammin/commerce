import type { Database } from '@/types'
import { toast } from 'vue-sonner'

export interface SearchResult {
  id: string
  customer_name: string
  customer_phone: string | null
  source_table: 'orders' | 'guest_checkouts'
  source: 'online' | 'offline'
  status: string
  final_amount: number
  created_at: string
}

export interface ReturnOrderItem {
  product_id: string
  product_name: string
  ordered_quantity: number
  price_per_item: number
  bonus_points_per_item: number
  returned_quantity: number
  available_quantity: number
}

export interface ReturnOrder {
  id: string
  created_at: string
  status: string
  total_amount: number
  final_amount: number
  bonuses_spent: number
  bonuses_awarded: number
  user_id: string | null
  customer_name: string
  customer_phone: string | null
  days_since_order: number
  can_return: boolean
  source_table: 'orders' | 'guest_checkouts'
  source: 'online' | 'offline'
  items: ReturnOrderItem[]
}

export interface ReturnResult {
  return_id: string
  order_id: string
  items_count: number
  refund_amount: number
  bonuses_cancelled: number
}

export const useAdminReturnsStore = defineStore('adminReturnsStore', () => {
  const supabase = useSupabaseClient<Database>()

  // --- Состояние ---
  const order = ref<ReturnOrder | null>(null)
  const isLoading = ref(false)
  const isProcessing = ref(false)
  const lastResult = ref<ReturnResult | null>(null)
  const searchResults = ref<SearchResult[]>([])
  const isSearching = ref(false)

  // --- Поиск заказов ---
  async function searchOrders(query: string) {
    const q = query.trim()
    if (!q) {
      searchResults.value = []
      return
    }

    isSearching.value = true
    searchResults.value = []

    try {
      const { data, error } = await (supabase.rpc as Function)('search_orders_for_return', {
        p_query: q,
      })

      if (error)
        throw error
      searchResults.value = (data as SearchResult[]) || []
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(`Ошибка поиска: ${message}`)
      searchResults.value = []
    }
    finally {
      isSearching.value = false
    }
  }

  // --- Загрузка заказа для возврата ---
  async function loadOrder(orderId: string) {
    isLoading.value = true
    order.value = null
    lastResult.value = null

    try {
      const { data, error } = await (supabase.rpc as Function)('get_order_for_return', {
        p_order_id: orderId,
      })

      if (error)
        throw error
      order.value = data as ReturnOrder
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(`Ошибка: ${message}`)
      order.value = null
    }
    finally {
      isLoading.value = false
    }
  }

  // --- Оформление возврата ---
  async function processReturn(
    orderId: string,
    items: Array<{ product_id: string, quantity: number }>,
    reason: string,
  ): Promise<ReturnResult | null> {
    isProcessing.value = true

    try {
      const { data, error } = await (supabase.rpc as Function)('process_order_return', {
        p_order_id: orderId,
        p_items: items,
        p_reason: reason,
      })

      if (error)
        throw error

      const result = data as ReturnResult
      lastResult.value = result

      toast.success('Возврат оформлен!')

      // Перезагружаем заказ чтобы обновить остатки
      await loadOrder(orderId)

      return result
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(`Ошибка: ${message}`)
      return null
    }
    finally {
      isProcessing.value = false
    }
  }

  function reset() {
    order.value = null
    lastResult.value = null
    searchResults.value = []
  }

  return {
    order,
    isLoading,
    isProcessing,
    lastResult,
    searchResults,
    isSearching,
    loadOrder,
    searchOrders,
    processReturn,
    reset,
  }
})
