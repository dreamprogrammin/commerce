import type { Database, ICartItem, ICheckoutData, ProductRow } from '@/types'
import { toast } from 'vue-sonner'
import { useProfileStore } from '../core/profileStore'

export const useCartStore = defineStore('cartStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const profileStore = useProfileStore()

  const items = ref<ICartItem[]>([])
  const isProcessing = ref(false)
  const bonusesToSpend = ref(0)

  /**
   * Общее количество всех единиц товаров в корзине (например, 2 футболки + 1 шорты = 3).
   */

  const totalItems = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

  /**
   * Общая стоимость товаров в корзине до применения скидок.
   */

  const subtotal = computed(() =>
    items.value.reduce((sum, item) => sum + (Number(item.product.price) * item.quantity), 0),
  )

  /**
   * Сумма скидки в тенге. Равна количеству бонусов, но не может превышать баланс пользователя.
   */

  const discountAmount = computed(() => {
    return Math.min(bonusesToSpend.value, profileStore.bonusBalance)
  })

  /**
   * Итоговая сумма к оплате с учетом скидки.
   */

  const total = computed(() => {
    const finalTotal = subtotal.value - discountAmount.value
    // Округляем до 2 знаков после запятой и гарантируем, что сумма не будет отрицательной.
    return finalTotal > 0 ? Number(finalTotal.toFixed(2)) : 0
  })

  /**
   * Полностью удаляет товар из корзины по его ID.
   */

  function removeItem(productId: string) {
    items.value = items.value.filter(i => i.product.id !== productId)
    toast.info('Товар удален из корзины')
  }

  /**
   * Обновляет количество конкретного товара. Если новое количество <= 0, товар удаляется.
   */

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

  /**
   * Полностью очищает корзину и сбрасывает примененные бонусы.
   */

  function clearCart() {
    items.value = []
    bonusesToSpend.value = 0
  }

  /**
   * Устанавливает, сколько бонусов пользователь хочет потратить, с проверками.
   */

  function setBonusesToSpend(amount: number) {
    const userBalance = profileStore.bonusBalance
    if (amount < 0 || Number.isNaN(amount)) {
      bonusesToSpend.value = 0
    }
    // Максимум бонусов для списания не может превышать сумму заказа.
    const maxBonusesForOrder = Math.ceil(subtotal.value)
    // Реальный максимум - это минимум из баланса пользователя и суммы заказа.
    const maxPossible = Math.min(userBalance, maxBonusesForOrder)
    // Устанавливаем значение, не превышающее этот максимум.
    bonusesToSpend.value = amount > maxPossible ? maxPossible : Math.floor(amount)
  }

  /**
   * Главная функция оформления заказа. Вызывает RPC-функцию `create_order`.
   */

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

      toast.success('Заказ успешно создан!', {
        description: 'Наш менеджер скоро с вами свяжется.',
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
  /**
   * Добавляет товар в корзину или увеличивает его количество.
   * @param product - Объект товара, который нужно добавить.
   * @param quantity - Количество единиц товара для добавления (по умолчанию 1).
   */
  function addItem(product: ProductRow, quantity: number = 1) {
  // Проверяем, что количество - это положительное число
    if (quantity <= 0)
      return

    const existingItem = items.value.find(i => i.product.id === product.id)

    if (existingItem) {
    // Если товар уже в корзине, УВЕЛИЧИВАЕМ его количество
      existingItem.quantity += quantity
    }
    else {
    // Если товара нет, ДОБАВЛЯЕМ его с указанным количеством
      items.value.push({ product, quantity })
    }

    toast.success(`"${product.name}" (x${quantity}) добавлен в корзину`)
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
})
