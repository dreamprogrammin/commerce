import type { Database } from '@/types'
import { toast } from 'vue-sonner'

export interface PosProduct {
  id: string
  name: string
  /** Цена продажи — как на сайте, со скидкой (`final_price`) */
  price: number
  /** Цена без скидки; до миграции 30.10.2026 поиск её не отдавал */
  full_price?: number
  stock_quantity: number
  bonus_points_award: number
  barcode: string | null
  image_url: string | null
  blur_placeholder: string | null
}

export interface PosCartItem {
  product: PosProduct
  quantity: number
}

export interface PosCustomer {
  id: string
  /**
   * `account` — аккаунт сайта, `offline` — карточка магазина (30.10.2026):
   * покупатель без аккаунта, заведённый кассой по телефону
   */
  kind: 'account' | 'offline'
  first_name: string | null
  last_name: string | null
  phone: string | null
  active_bonus_balance: number
  pending_bonus_balance: number
}

export interface OfflineSaleResult {
  order_id: string
  type: 'user_order' | 'offline_customer_order' | 'guest_checkout'
  total: number
  discount: number
  final: number
  bonuses_spent: number
  bonuses_awarded: number
}

export const useAdminPosStore = defineStore('adminPosStore', () => {
  const supabase = useSupabaseClient<Database>()

  // --- Состояние ---
  const searchQuery = ref('')
  const searchResults = ref<PosProduct[]>([])
  const isSearching = ref(false)

  const cart = ref<PosCartItem[]>([])

  const phoneQuery = ref('')
  const customer = ref<PosCustomer | null>(null)
  const isLookingUpCustomer = ref(false)
  /** Номер, по которому никого не нашли, — касса предлагает завести карточку */
  const unknownPhone = ref<string | null>(null)
  const isCreatingCustomer = ref(false)

  const paymentMethod = ref<'cash' | 'card' | 'transfer'>('cash')
  const bonusesToSpend = ref(0)

  const isProcessing = ref(false)
  const lastSaleResult = ref<OfflineSaleResult | null>(null)

  // --- Вычисляемые значения ---
  const cartTotal = computed(() =>
    cart.value.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  )

  const cartBonusAward = computed(() =>
    cart.value.reduce((sum, item) => sum + item.product.bonus_points_award * item.quantity, 0),
  )

  const maxBonusesToSpend = computed(() => {
    if (!customer.value)
      return 0
    return Math.min(customer.value.active_bonus_balance, cartTotal.value)
  })

  const finalTotal = computed(() => {
    return Math.max(cartTotal.value - bonusesToSpend.value, 0)
  })

  // --- Поиск товаров ---
  async function searchProducts(query: string) {
    if (!query.trim()) {
      searchResults.value = []
      return
    }

    isSearching.value = true
    try {
      // TODO: после миграции перегенерировать типы: supabase gen types typescript --local > types/supabase.ts
      const { data, error } = await (supabase.rpc as Function)('search_products_for_pos', {
        p_query: query.trim(),
      })

      if (error)
        throw error
      searchResults.value = (data as PosProduct[]) ?? []
    }
    catch (err) {
      console.error('Ошибка поиска товаров:', err)
      toast.error('Ошибка поиска товаров')
    }
    finally {
      isSearching.value = false
    }
  }

  // --- Поиск клиента по телефону ---
  // Сначала аккаунт сайта, потом карточка магазина. Никого — касса предложит
  // завести карточку, иначе продажа уйдёт анонимной.
  async function lookupCustomer(phone: string) {
    unknownPhone.value = null
    if (!phone.trim()) {
      customer.value = null
      return
    }

    isLookingUpCustomer.value = true
    try {
      const { data: accounts, error } = await supabase.rpc('get_profile_by_phone', { p_phone: phone.trim() })
      if (error)
        throw error

      let found: PosCustomer | null = accounts?.[0] ? { ...accounts[0], kind: 'account' } : null
      if (!found) {
        const { data: cards, error: cardError } = await supabase.rpc('pos_find_offline_customer', { p_phone: phone.trim() })
        if (cardError)
          throw cardError
        found = cards?.[0] ? { ...cards[0], kind: 'offline' } : null
      }

      customer.value = found
      if (found) {
        toast.success(`Клиент найден: ${getCustomerName(found)}`)
      }
      else {
        unknownPhone.value = phone.trim()
        toast.info('Клиент не найден. Можно завести карточку или продать анонимно.')
      }
    }
    catch (err) {
      console.error('Ошибка поиска клиента:', err)
      toast.error('Ошибка при поиске клиента')
    }
    finally {
      isLookingUpCustomer.value = false
    }
  }

  // --- Карточка магазина для нового покупателя ---
  async function createOfflineCustomer(firstName: string, lastName: string) {
    if (!unknownPhone.value || isCreatingCustomer.value)
      return
    isCreatingCustomer.value = true
    try {
      const { data, error } = await supabase.rpc('create_offline_customer', {
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: unknownPhone.value,
      })
      if (error)
        throw error
      customer.value = data?.[0] ? { ...data[0], kind: 'offline' } : null
      unknownPhone.value = null
      if (customer.value)
        toast.success(`Карточка заведена: ${getCustomerName(customer.value)}`)
    }
    catch (err: any) {
      console.error('Ошибка создания карточки:', err)
      toast.error(err?.message || 'Не удалось завести карточку')
    }
    finally {
      isCreatingCustomer.value = false
    }
  }

  function clearCustomer() {
    customer.value = null
    unknownPhone.value = null
    phoneQuery.value = ''
    bonusesToSpend.value = 0
  }

  // --- Управление корзиной ---
  function addToCart(product: PosProduct) {
    const existing = cart.value.find(item => item.product.id === product.id)

    if (existing) {
      if (existing.quantity >= product.stock_quantity) {
        toast.warning(`Максимум ${product.stock_quantity} шт. доступно`)
        return
      }
      existing.quantity++
    }
    else {
      if (product.stock_quantity === 0) {
        toast.warning('Товар отсутствует на складе')
        return
      }
      cart.value.push({ product, quantity: 1 })
    }
  }

  function removeFromCart(productId: string) {
    cart.value = cart.value.filter(item => item.product.id !== productId)
    if (bonusesToSpend.value > maxBonusesToSpend.value) {
      bonusesToSpend.value = maxBonusesToSpend.value
    }
  }

  function updateQuantity(productId: string, qty: number) {
    const item = cart.value.find(i => i.product.id === productId)
    if (!item)
      return

    if (qty <= 0) {
      removeFromCart(productId)
      return
    }

    if (qty > item.product.stock_quantity) {
      toast.warning(`Максимум ${item.product.stock_quantity} шт.`)
      item.quantity = item.product.stock_quantity
      return
    }

    item.quantity = qty
    if (bonusesToSpend.value > maxBonusesToSpend.value) {
      bonusesToSpend.value = maxBonusesToSpend.value
    }
  }

  function clearCart() {
    cart.value = []
    bonusesToSpend.value = 0
  }

  // --- Оформление продажи ---
  async function completeSale(): Promise<OfflineSaleResult | null> {
    if (cart.value.length === 0) {
      toast.error('Корзина пуста')
      return null
    }

    isProcessing.value = true
    try {
      const cartItems = cart.value.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
      }))

      const { data, error } = await (supabase.rpc as Function)('create_offline_sale', {
        p_cart_items: cartItems,
        p_payment_method: paymentMethod.value,
        p_profile_id: customer.value?.kind === 'account' ? customer.value.id : null,
        p_offline_customer_id: customer.value?.kind === 'offline' ? customer.value.id : null,
        p_bonuses_to_spend: bonusesToSpend.value,
      })

      if (error)
        throw error

      const result = data as OfflineSaleResult
      lastSaleResult.value = result
      // Остаток проданных товаров — на сайте сразу (кеш страниц суточный)
      revalidatePages({ productIds: cartItems.map(item => item.product_id) })

      // Сбрасываем корзину и клиента после успешной продажи
      clearCart()
      clearCustomer()
      searchResults.value = []
      searchQuery.value = ''
      paymentMethod.value = 'cash'

      toast.success('Продажа оформлена!')
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

  // --- Утилиты ---
  function getCustomerName(c: PosCustomer): string {
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.phone || 'Клиент'
  }

  return {
    // State
    searchQuery,
    searchResults,
    isSearching,
    cart,
    phoneQuery,
    customer,
    isLookingUpCustomer,
    unknownPhone,
    isCreatingCustomer,
    paymentMethod,
    bonusesToSpend,
    isProcessing,
    lastSaleResult,
    // Computed
    cartTotal,
    cartBonusAward,
    maxBonusesToSpend,
    finalTotal,
    // Actions
    searchProducts,
    lookupCustomer,
    createOfflineCustomer,
    clearCustomer,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    completeSale,
    getCustomerName,
  }
})
