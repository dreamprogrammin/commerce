import type { Database, ICheckoutData, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import { useProfileStore } from '../core/profileStore'
import { useProductsStore } from './productsStore'

const CART_STORAGE_KEY = 'krakenshop-cart-v1'

// 🔥 Тип для элемента корзины - используем существующий ProductWithImages
export interface ICartItem {
  product: ProductWithImages // Это уже ProductRow + product_images[]
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
  const productsStore = useProductsStore()

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

  /**
   * Добавить товар в корзину
   * @param productIdOrObject - ID товара (string) или объект товара с полем id
   * @param quantity - Количество
   */
  async function addItem(productIdOrObject: string | { id: string }, quantity: number = 1) {
    // 🔥 Извлекаем ID из строки или объекта
    const productId = typeof productIdOrObject === 'string'
      ? productIdOrObject
      : productIdOrObject.id

    if (!productId || typeof productId !== 'string') {
      toast.error('Неверный ID товара')
      console.error('Invalid product ID:', productIdOrObject)
      return
    }

    // 1. Проверяем, есть ли товар уже в корзине
    const existingItem = items.value.find(item => item.product.id === productId)

    if (existingItem) {
      existingItem.quantity += quantity
      toast.success(`"${existingItem.product.name}" (+${quantity})`)
      return
    }

    // 2. Загружаем полный товар с изображениями
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
        // 3. Добавляем в корзину полный объект с изображениями
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
      const currentUser = await ensureUserSession()
      if (!currentUser) {
        throw new Error('Не удалось создать сессию для оформления заказа.')
      }

      const { data: newOrderId, error } = await supabase.rpc('create_order', {
        p_cart_items: items.value.map(i => ({
          product_id: i.product.id,
          quantity: i.quantity,
        })),
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
        description: `Спасибо за покупку! ${bonusesAwarded} бонусов будут начислены на ваш счет и станут активны через 14 дней.`,
        duration: 10000,
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
