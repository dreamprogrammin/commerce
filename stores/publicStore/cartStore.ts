import type { Database, ICartItem, ICheckoutData, ProductRow } from '@/types'
import { toast } from 'vue-sonner'
import { useProfileStore } from '../core/profileStore'

const CART_STORAGE_KEY = 'krakenshop-cart-v1'

export const useCartStore = defineStore('cartStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const profileStore = useProfileStore()
  const user = useSupabaseUser()

  const items = ref<ICartItem[]>([])
  const isProcessing = ref(false)
  const bonusesToSpend = ref(0)

  // УБИРАЕМ всю логику hydrateFromStorage() и watch() - плагин все сделает сам

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + (Number(item.product.price) * item.quantity), 0),
  )

  const discountAmount = computed(() => {
    return Math.min(bonusesToSpend.value, profileStore.bonusBalance)
  })

  const total = computed(() => {
    const finalTotal = subtotal.value - discountAmount.value
    return finalTotal > 0 ? Number(finalTotal.toFixed(2)) : 0
  })

  async function addItem(product: ProductRow, quantity: number = 1) {
    const currentUser = await ensureUserSession()

    if (!currentUser) {
      toast.error('Не удалось добавить товар', { description: 'Пожалуйста, обновите страницу и попробуйте снова.' })
      return
    }

    if (quantity <= 0)
      return

    const existingItemIndex = items.value.findIndex(i => i.product.id === product.id)

    if (existingItemIndex > -1) {
      items.value = items.value.map((item, index) =>
        index === existingItemIndex
          ? { ...item, quantity: item.quantity + quantity }
          : item,
      )
    }
    else {
      items.value = [...items.value, { product, quantity }]
    }

    toast.success(`"${product.name}" (x${quantity}) добавлен в корзину`)
  }

  function removeItem(productId: string) {
    items.value = items.value.filter(i => i.product.id !== productId)
    toast.info('Товар удален из корзины')
  }

  function updateQuantity(productId: string, quantity: number) {
    const item = items.value.find(i => i.product.id === productId)
    if (item) {
      if (quantity > 0) {
        item.quantity = quantity
      }
      else {
        removeItem(productId)
      }
    }
  }

  function clearCart() {
    items.value = []
    bonusesToSpend.value = 0
  }

  function setBonusesToSpend(amount: number) {
    const userBalance = profileStore.bonusBalance
    if (amount < 0 || Number.isNaN(amount)) {
      bonusesToSpend.value = 0
      return
    }
    const maxBonusesForOrder = Math.ceil(subtotal.value)
    const maxPossible = Math.min(userBalance, maxBonusesForOrder)
    bonusesToSpend.value = amount > maxPossible ? maxPossible : Math.floor(amount)
  }

  /**
   * Гарантирует наличие сессии (реальной или анонимной) перед действием с корзиной.
   */

  async function ensureUserSession() {
    if (user.value)
      return user.value
    try {
      const { data, error } = await supabase
        .auth
        .signInAnonymously()
      if (error)
        throw error
      console.warn('Создана анонимная сессия для гостя:', data.user?.id)
      return data.user
    }
    catch (e: any) {
      toast.error('Ошибка создания гостевой сессии', { description: e.message })
      return null
    }
  }

  async function checkout(orderData: ICheckoutData) {
    if (items.value.length === 0) {
      toast.error('Ваша корзина пуста.')
      return
    }
    isProcessing.value = true
    try {
      const { data: newOrderId, error } = await supabase.rpc('create_order', {
        p_cart_items: items.value.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
        p_delivery_method: orderData.deliveryMethod,
        p_payment_method: orderData.paymentMethod,
        p_delivery_address: orderData.deliveryAddress,
        p_guest_info: orderData.guestInfo,
        p_bonuses_to_spend: bonusesToSpend.value,
      })

      if (error)
        throw error
      const bonusesAwarded = items.value
        .reduce((sum, item) =>
          sum + (item.product.bonus_points_award || 0) * item.quantity, 0)

      toast.success('Заказ успешно создан!', {
        description: 'Наш менеджер скоро с вами свяжется.',
      })

      toast.success('Заказ успешно создан!', {
        description: `Спасибо за покупку! ${bonusesAwarded} бонусов будут начислены на ваш счет и станут активны через 14 дней. Отслеживать статус можно в личном кабинете.`,
        duration: 10000, // Показываем еще дольше
      })

      clearCart()
      await router.push(`/order/success/${newOrderId}`)
    }
    catch (error: any) {
      toast.error('Ошибка оформления заказа', { description: error.message })
    }
    finally {
      isProcessing.value = false
    }
  }

  return {
    items,
    isProcessing,
    bonusesToSpend,
    totalItems,
    subtotal,
    discountAmount,
    total,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    checkout,
    setBonusesToSpend,
  }
}, {
  persist: {
    key: CART_STORAGE_KEY,
    pick: ['items', 'bonusesToSpend'],
  },
})
