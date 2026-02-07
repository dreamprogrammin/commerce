import type { Database, ICheckoutData, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import { formatPriceWithDiscount } from '@/utils/formatPrice'
import { useProfileStore } from '../core/profileStore'

const CART_STORAGE_KEY = 'krakenshop-cart-v1'

export interface ICartItem {
  product: ProductWithImages
  quantity: number
}

export const useCartStore = defineStore('cartStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const profileStore = useProfileStore()
  const user = useSupabaseUser()

  const items = ref<ICartItem[]>([])
  const isProcessing = ref(false)
  const bonusesToSpend = ref(0)
  const isAddingItem = ref(false) // Флаг для предотвращения race condition

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => {
      // Используем финальную цену с учетом скидки
      const priceData = formatPriceWithDiscount(
        Number(item.product.price),
        item.product.discount_percentage,
      )
      return sum + (priceData.finalNumber * item.quantity)
    }, 0),
  )

  const discountAmount = computed(() => {
    // Только для авторизованных пользователей
    if (!user.value)
      return 0
    return Math.min(bonusesToSpend.value, profileStore.bonusBalance)
  })

  const total = computed(() => {
    const finalTotal = subtotal.value - discountAmount.value
    return finalTotal > 0 ? Number(finalTotal.toFixed(2)) : 0
  })

  // Вычисляем бонусы, которые пользователь получит (только для авторизованных)
  const bonusesToAward = computed(() => {
    if (!user.value)
      return 0
    return items.value.reduce((sum, item) =>
      sum + (item.product.bonus_points_award || 0) * item.quantity, 0)
  })

  async function addItem(productIdOrObject: string | { id: string }, quantity: number = 1) {
    // ✅ Предотвращение параллельных запросов (race condition fix)
    if (isAddingItem.value) {
      console.log('[CartStore] Already adding item, ignoring duplicate request')
      return
    }

    const productId = typeof productIdOrObject === 'string'
      ? productIdOrObject
      : productIdOrObject?.id

    if (!productId || typeof productId !== 'string') {
      toast.error('Неверный ID товара')
      console.error('Invalid product ID:', productIdOrObject)
      return
    }

    const existingItem = items.value.find(item => item.product.id === productId)

    if (existingItem) {
      existingItem.quantity += quantity
      toast.success(`"${existingItem.product.name}" (+${quantity})`)
      return
    }

    isAddingItem.value = true
    try {
      const { data: fullProduct, error } = await supabase
        .from('products')
        .select(`
          *,
          product_images (
            id,
            image_url,
            blur_placeholder,
            alt_text,
            display_order
          )
        `)
        .eq('id', productId)
        .order('display_order', {
          referencedTable: 'product_images',
          ascending: true,
        })
        .single()

      if (error)
        throw error

      if (fullProduct) {
        items.value.push({
          product: fullProduct as ProductWithImages,
          quantity,
        })
        toast.success(`"${fullProduct.name}" добавлен в корзину!`)
      }
      else {
        toast.error('Товар не найден')
      }
    }
    catch (e: any) {
      console.error('Ошибка при добавлении товара в корзину:', e)
      toast.error('Не удалось добавить товар в корзину')
    }
    finally {
      isAddingItem.value = false
    }
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
    // Бонусы только для авторизованных
    if (!user.value) {
      bonusesToSpend.value = 0
      return
    }

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
   * Оформление заказа
   * Автоматически определяет: гость или авторизованный пользователь
   */
  async function checkout(orderData: ICheckoutData) {
    if (items.value.length === 0) {
      toast.error('Ваша корзина пуста.')
      return
    }

    isProcessing.value = true

    try {
      const cartItems = items.value.map(i => ({
        product_id: i.product.id,
        quantity: i.quantity,
      }))

      let orderId: string | null = null

      // Определяем: гость или авторизованный пользователь
      if (!user.value) {
        // === ГОСТЕВОЙ ЗАКАЗ ===
        if (!orderData.guestInfo?.name || !orderData.guestInfo?.email || !orderData.guestInfo?.phone) {
          throw new Error('Заполните все обязательные поля: имя, email и телефон')
        }

        // DEBUG: Логируем данные гостя перед отправкой
        console.log('🛒 Guest checkout data:', {
          guestInfo: orderData.guestInfo,
          phone: orderData.guestInfo.phone,
        })

        const { data, error } = await supabase.rpc('create_guest_checkout', {
          p_cart_items: cartItems,
          p_guest_info: orderData.guestInfo,
          p_delivery_method: orderData.deliveryMethod,
          p_delivery_address: orderData.deliveryAddress,
          p_payment_method: orderData.paymentMethod,
        })

        if (error)
          throw error
        orderId = data

        toast.success('Заказ успешно оформлен!', {
          description: 'Спасибо за покупку! Мы свяжемся с вами в ближайшее время. Корзина сохранена для повторных заказов.',
          duration: 5000,
        })
      }
      else {
        // === ЗАКАЗ АВТОРИЗОВАННОГО ПОЛЬЗОВАТЕЛЯ ===
        const { data, error } = await supabase.rpc('create_user_order', {
          p_cart_items: cartItems,
          p_delivery_method: orderData.deliveryMethod,
          p_delivery_address: orderData.deliveryAddress,
          p_payment_method: orderData.paymentMethod,
          p_bonuses_to_spend: bonusesToSpend.value,
        })

        if (error)
          throw error
        orderId = data

        const bonusesAwarded = bonusesToAward.value

        // 🔥 КРИТИЧНО: Перезагружаем профиль для обновления бонусов ДО показа toast
        await profileStore.loadProfile(true)

        // ✅ Принудительно триггерим реактивность через nextTick
        await nextTick()

        toast.success('Заказ успешно создан!', {
          description: bonusesAwarded > 0
            ? `Спасибо за покупку! ${bonusesAwarded} бонусов будут начислены на ваш счет и станут активны через 7 дней.`
            : 'Спасибо за покупку!',
          duration: 10000,
        })
      }

      if (!orderId) {
        throw new Error('Не удалось получить ID заказа')
      }

      // ✅ Очищаем корзину ТОЛЬКО для авторизованных пользователей
      // Для гостей сохраняем корзину в localStorage, чтобы не пришлось заново набирать
      if (user.value) {
        clearCart()
      }

      // Редирект на страницу успеха
      await router.push(`/order/success/${orderId}`)
    }
    catch (error: any) {
      console.error('Checkout error:', error)
      toast.error('Ошибка оформления заказа', {
        description: error.message || 'Попробуйте еще раз',
        duration: 5000,
      })
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
    bonusesToAward,
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
