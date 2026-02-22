import type { Database } from '@/types'
import { toast } from 'vue-sonner'

export interface SaleItem {
  id: string
  source_table: 'orders' | 'guest_checkouts'
  source: 'online' | 'offline'
  status: string
  customer_name: string
  customer_phone: string | null
  total_amount: number
  final_amount: number
  bonuses_spent: number
  bonuses_awarded: number
  payment_method: string
  created_at: string
}

export interface ReceiptItem {
  product_name: string
  quantity: number
  price_per_item: number
  line_total: number
}

export interface ReceiptData {
  id: string
  source_table: 'orders' | 'guest_checkouts'
  source: 'online' | 'offline'
  status: string
  customer_name: string
  customer_phone: string | null
  payment_method: string
  total_amount: number
  final_amount: number
  bonuses_spent: number
  bonuses_awarded: number
  created_at: string
  items: ReceiptItem[]
}

export interface SalesFilters {
  source: 'online' | 'offline' | null
  status: string | null
  dateFrom: string | null
  dateTo: string | null
  search: string
}

export const useAdminSalesStore = defineStore('adminSalesStore', () => {
  const supabase = useSupabaseClient<Database>()

  // --- Состояние ---
  const sales = ref<SaleItem[]>([])
  const totalCount = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(20)
  const isLoading = ref(false)
  const filters = ref<SalesFilters>({
    source: null,
    status: null,
    dateFrom: null,
    dateTo: null,
    search: '',
  })

  const receiptData = ref<ReceiptData | null>(null)
  const isLoadingReceipt = ref(false)

  // --- Загрузка списка продаж ---
  async function fetchSales() {
    isLoading.value = true

    try {
      const params: Record<string, unknown> = {
        p_page: currentPage.value,
        p_page_size: pageSize.value,
      }

      if (filters.value.source)
        params.p_source = filters.value.source
      if (filters.value.status)
        params.p_status = filters.value.status
      if (filters.value.dateFrom)
        params.p_date_from = new Date(filters.value.dateFrom).toISOString()
      if (filters.value.dateTo) {
        // Конец дня для dateTo
        const d = new Date(filters.value.dateTo)
        d.setDate(d.getDate() + 1)
        params.p_date_to = d.toISOString()
      }
      if (filters.value.search.trim())
        params.p_search = filters.value.search.trim()

      const { data, error } = await (supabase.rpc as Function)('get_sales_list', params)

      if (error)
        throw error

      const result = data as { items: SaleItem[], total_count: number, page: number, page_size: number }
      sales.value = result.items || []
      totalCount.value = result.total_count || 0
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(`Ошибка загрузки продаж: ${message}`)
      sales.value = []
      totalCount.value = 0
    }
    finally {
      isLoading.value = false
    }
  }

  // --- Загрузка чека ---
  async function fetchReceipt(orderId: string) {
    isLoadingReceipt.value = true
    receiptData.value = null

    try {
      const { data, error } = await (supabase.rpc as Function)('get_sale_receipt', {
        p_order_id: orderId,
      })

      if (error)
        throw error
      receiptData.value = data as ReceiptData
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      toast.error(`Ошибка загрузки чека: ${message}`)
      receiptData.value = null
    }
    finally {
      isLoadingReceipt.value = false
    }
  }

  // --- Пагинация ---
  function setPage(page: number) {
    currentPage.value = page
    fetchSales()
  }

  // --- Обновление фильтров ---
  function setFilters(newFilters: Partial<SalesFilters>) {
    Object.assign(filters.value, newFilters)
    currentPage.value = 1
    fetchSales()
  }

  // --- Сброс ---
  function reset() {
    sales.value = []
    totalCount.value = 0
    currentPage.value = 1
    filters.value = {
      source: null,
      status: null,
      dateFrom: null,
      dateTo: null,
      search: '',
    }
    receiptData.value = null
  }

  return {
    sales,
    totalCount,
    currentPage,
    pageSize,
    isLoading,
    filters,
    receiptData,
    isLoadingReceipt,
    fetchSales,
    fetchReceipt,
    setPage,
    setFilters,
    reset,
  }
})
