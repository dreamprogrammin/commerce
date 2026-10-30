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
  /** Для поиска и фильтра кассы (каталог грузится целиком, 31.10.2026) */
  sku?: string | null
  category_id?: string | null
  sales_count?: number
}

export interface PosCategory {
  id: string
  name: string
  parent_id: string | null
}

/** Слова запроса — все должны встретиться в названии, артикуле или штрихкоде. */
export function matchesPosQuery(product: PosProduct, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length)
    return true
  const haystack = `${product.name} ${product.sku ?? ''} ${product.barcode ?? ''}`.toLowerCase()
  return words.every(w => haystack.includes(w))
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
  /*
   * Каталог кассы — все активные товары в наличии, один запрос при открытии
   * и после каждой продажи. Раньше каждое нажатие клавиши шло в базу, а до
   * ввода список был пуст; теперь поиск и фильтр по категории мгновенные,
   * а при открытии сразу видны ходовые товары (31.10.2026, просьба владельца:
   * «долго искать товар»).
   */
  const catalog = ref<PosProduct[]>([])
  const categories = ref<PosCategory[]>([])
  const isLoadingCatalog = ref(false)
  const categoryId = ref<string | null>(null)

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

  // --- Каталог ---
  async function loadCatalog() {
    isLoadingCatalog.value = true
    try {
      const [{ data: products, error }, { data: cats }] = await Promise.all([
        supabase.from('products')
          .select('id, name, price, final_price, stock_quantity, bonus_points_award, barcode, sku, category_id, sales_count, product_images(image_url, blur_placeholder, display_order)')
          .eq('is_active', true)
          .gt('stock_quantity', 0),
        supabase.from('categories').select('id, name, parent_id').order('display_order'),
      ])
      if (error)
        throw error
      catalog.value = (products ?? []).map((p) => {
        const image = [...(p.product_images ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]
        return {
          id: p.id,
          name: p.name.trim(),
          price: Number(p.final_price ?? p.price),
          full_price: Number(p.price),
          stock_quantity: p.stock_quantity ?? 0,
          bonus_points_award: p.bonus_points_award ?? 0,
          barcode: p.barcode,
          sku: p.sku,
          category_id: p.category_id,
          sales_count: p.sales_count ?? 0,
          image_url: image?.image_url ?? null,
          blur_placeholder: image?.blur_placeholder ?? null,
        }
      })
      categories.value = cats ?? []
    }
    catch (err) {
      console.error('Ошибка загрузки каталога:', err)
      toast.error('Не удалось загрузить товары')
    }
    finally {
      isLoadingCatalog.value = false
    }
  }

  /** Категория верхнего уровня для каждой категории — товары лежат в листьях. */
  const rootCategoryOf = computed(() => {
    const byId = new Map(categories.value.map(c => [c.id, c]))
    const roots = new Map<string, string>()
    for (const c of categories.value) {
      let cur = c
      const seen = new Set<string>()
      while (cur.parent_id && byId.has(cur.parent_id) && !seen.has(cur.id)) {
        seen.add(cur.id)
        cur = byId.get(cur.parent_id)!
      }
      roots.set(c.id, cur.id)
    }
    return roots
  })

  /** Верхние категории, в которых есть товары в наличии, — по числу товаров. */
  const topCategories = computed(() => {
    const counts = new Map<string, number>()
    for (const p of catalog.value) {
      const root = p.category_id ? rootCategoryOf.value.get(p.category_id) : null
      if (root)
        counts.set(root, (counts.get(root) ?? 0) + 1)
    }
    return categories.value
      .filter(c => counts.has(c.id))
      .map(c => ({ ...c, count: counts.get(c.id)! }))
      .sort((a, b) => b.count - a.count)
  })

  /** Видимые товары: запрос и категория; без запроса — сначала ходовые. */
  const visibleProducts = computed(() => {
    const q = searchQuery.value.trim()
    return catalog.value
      .filter(p => !categoryId.value || (p.category_id && rootCategoryOf.value.get(p.category_id) === categoryId.value))
      .filter(p => matchesPosQuery(p, q))
      .sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0) || a.name.localeCompare(b.name, 'ru'))
  })

  function findByBarcode(code: string): PosProduct | undefined {
    const c = code.trim()
    return c ? catalog.value.find(p => p.barcode === c) : undefined
  }

  /**
   * Привязать штрихкод к товару прямо с кассы: на 31.10.2026 он был только у
   * 3 товаров из 186, сканер почти всегда отвечал бы «не найдено». Код,
   * который уже стоит у другого товара, не перехватываем молча.
   */
  async function bindBarcode(product: PosProduct, code: string): Promise<boolean> {
    const c = code.trim()
    const owner = findByBarcode(c)
    if (owner && owner.id !== product.id) {
      toast.error(`Этот штрихкод уже у товара «${owner.name}»`)
      return false
    }
    const { error } = await supabase.from('products').update({ barcode: c }).eq('id', product.id)
    if (error) {
      toast.error(`Не удалось сохранить штрихкод: ${error.message}`)
      return false
    }
    product.barcode = c
    return true
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

      // Без уведомлений об успехе: на кассе они ложатся поверх «Итого» и
      // кнопки оформления, а покупатель или форма карточки и так на экране
      customer.value = found
      if (!found)
        unknownPhone.value = phone.trim()
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
      searchQuery.value = ''
      paymentMethod.value = 'cash'
      // Остатки изменились — каталог заново, без ожидания
      loadCatalog()

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
    catalog,
    categories,
    categoryId,
    isLoadingCatalog,
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
    topCategories,
    visibleProducts,
    // Actions
    loadCatalog,
    findByBarcode,
    bindBarcode,
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
