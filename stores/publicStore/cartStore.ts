import type { Database, ICheckoutData, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import { COURIER_DELIVERY_COST, FREE_SHIPPING_THRESHOLD } from '@/constants'
import {
  buildDeliveryDates,
  clampIndex,
  DELIVERY_DATE_COUNT,
  DELIVERY_SLOTS,
} from '@/utils/deliverySlots'
import { useProfileStore } from '../core/profileStore'

export type DeliveryMethod = 'pickup' | 'courier'

const CART_STORAGE_KEY = 'uhti-cart-v1'

export interface ICartItem {
  product: ProductWithImages
  quantity: number
}

export const useCartStore = defineStore(
  'cartStore',
  () => {
    const supabase = useSupabaseClient<Database>()
    const router = useRouter()
    const profileStore = useProfileStore()
    const user = useSupabaseUser()

    const items = ref<ICartItem[]>([])
    const isProcessing = ref(false)
    const bonusesToSpend = ref(0)

    /**
     * Способ получения — общий для корзины и оформления.
     *
     * Раньше он жил только в orderForm на /checkout со значением 'pickup', а
     * /cart считала доставку по курьеру. Покупатель видел в корзине «Итого» с
     * доставкой, переходил дальше и получал сумму на 1000 ₸ меньше. Теперь
     * значение одно на оба шага, как S.fulfill в макете, и по умолчанию —
     * курьер (в макете `fulfill:'delivery'`).
     */
    const deliveryMethod = ref<DeliveryMethod>('courier')

    /**
     * Адрес доставки — тоже общий, а не локальное поле формы оформления.
     * Его показывает мобильная локейшн-панель, которая живёт в layout и
     * видна на обоих шагах, а вводится он на /checkout. В макете это ровно
     * так же: S.address — одно поле состояния на всю корзину.
     */
    const deliveryAddress = ref({ city: 'Алматы', line1: '' })

    /**
     * Желаемые дата и интервал доставки — индексами, а не значениями.
     * Почему индексами, см. utils/deliverySlots.ts: индекс 0 всегда «сегодня»,
     * поэтому сохранённый выбор не протухает. Абсолютные значения считаются
     * ниже, в момент отправки заказа.
     */
    /**
     * Выбранный пункт самовывоза. Как и способ получения, живёт в корзине:
     * его показывает локейшн-панель из layout, а выбирают на /checkout.
     */
    const pickupPointId = ref<string | null>(null)

    const deliveryDateIndex = ref(0)
    const deliverySlotIndex = ref(0)

    /**
     * Когда оформлен последний заказ — только чтобы показать дату гостю.
     *
     * Гостевой заказ лежит в guest_checkouts, а RLS отдаёт эту таблицу лишь
     * админам: покупатель-гость не может прочитать даже собственный заказ и
     * узнать время его создания. Запоминаем момент оформления на клиенте.
     *
     * Храним вместе с id: иначе, оформив два заказа и вернувшись по ссылке на
     * первый, покупатель увидел бы дату второго.
     *
     * Время клиентское, а не серверное — при сбитых часах разойдётся с тем,
     * что записано в базе. Для справочной строки это приемлемо, для чего-то
     * большего брать её отсюда нельзя.
     */
    const lastOrder = ref<{ id: string, at: string } | null>(null)

    const deliveryDateIso = computed(
      () => buildDeliveryDates()[clampIndex(deliveryDateIndex.value, DELIVERY_DATE_COUNT)]?.iso ?? null,
    )

    const deliverySlotLabel = computed(
      () => DELIVERY_SLOTS[clampIndex(deliverySlotIndex.value, DELIVERY_SLOTS.length)] ?? null,
    )
    const isAddingItem = ref(false) // Флаг для предотвращения race condition
    const syncTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
    const isMergingFromServer = ref(false) // Блокирует sync→server пока грузим данные с сервера
    const isCartOpen = ref(false) // 🔥 Управление состоянием шторки корзины
    const hasMergedOnLogin = ref(false) // Флаг для предотвращения повторного мерджа

    /**
     * Количество позиции числом. Корзина восстанавливается из localStorage
     * (persist), поэтому там может лежать что угодно, включая записи от старой
     * версии схемы. Любое нечисло здесь превращало итог в NaN.
     */
    function itemQuantity(item: ICartItem): number {
      const quantity = Number(item.quantity)
      return Number.isFinite(quantity) ? quantity : 0
    }

    /**
     * Цена позиции за штуку.
     *
     * final_price — generated-колонка БД и в типах помечена обязательной, но
     * в корзину товар может приехать из localStorage от версии, где её ещё не
     * было, или из выборки, которая её не запросила. Тогда undefined * qty
     * давало NaN, и он утекал дальше: в total, в maxBonusesForOrder и в
     * total_amount, который уходит на сервер при синхронизации заказа.
     *
     * Фолбэк на price — та же конвенция, что уже используется на карточке
     * товара и в ProductCard (`final_price || price`).
     */
    function itemUnitPrice(item: ICartItem): number {
      const price = Number(item.product?.final_price ?? item.product?.price)
      return Number.isFinite(price) ? price : 0
    }

    const totalItems = computed(() =>
      items.value.reduce((sum: number, item) => sum + itemQuantity(item), 0),
    )

    const subtotal = computed(() =>
      items.value.reduce(
        (sum: number, item) => sum + itemUnitPrice(item) * itemQuantity(item),
        0,
      ),
    )

    /**
     * Стоимость доставки. Самовывоз бесплатен всегда, курьер — от порога.
     * Считается от subtotal (до промокода и бонусов), как в calc() макета.
     */
    const deliveryCost = computed(() => {
      if (deliveryMethod.value === 'pickup')
        return 0
      return subtotal.value >= FREE_SHIPPING_THRESHOLD
        ? 0
        : COURIER_DELIVERY_COST
    })

    const isFreeShipping = computed(() => deliveryCost.value === 0)

    function setDeliveryMethod(method: DeliveryMethod) {
      deliveryMethod.value = method
    }

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
      return items.value.reduce(
        (sum, item) =>
          sum + (item.product.bonus_points_award || 0) * item.quantity,
        0,
      )
    })

    async function addItem(
      productIdOrObject: string | { id: string },
      quantity: number = 1,
    ) {
      // ✅ Предотвращение параллельных запросов (race condition fix)
      if (isAddingItem.value) {
        console.log(
          '[CartStore] Already adding item, ignoring duplicate request',
        )
        return
      }

      const productId
        = typeof productIdOrObject === 'string'
          ? productIdOrObject
          : productIdOrObject?.id

      if (!productId || typeof productId !== 'string') {
        toast.error('Неверный ID товара')
        console.error('Invalid product ID:', productIdOrObject)
        return
      }

      const existingItem = items.value.find(
        item => item.product.id === productId,
      )

      if (existingItem) {
        existingItem.quantity += quantity
        toast.success(`"${existingItem.product.name}" (+${quantity})`)
        // 🔥 Открываем корзину при добавлении товара
        isCartOpen.value = true
        // 🔥 Сбрасываем бонусы при изменении корзины
        bonusesToSpend.value = 0
        return
      }

      isAddingItem.value = true
      try {
        const { data: fullProduct, error } = await supabase
          .from('products')
          .select(
            `
          *,
          product_images (
            id,
            image_url,
            blur_placeholder,
            alt_text,
            display_order
          )
        `,
          )
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
          // 🔥 Открываем корзину при добавлении нового товара
          isCartOpen.value = true
          // 🔥 Сбрасываем бонусы при изменении корзины
          bonusesToSpend.value = 0
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
      // 🔥 Сбрасываем бонусы при изменении корзины
      bonusesToSpend.value = 0
    }

    function updateQuantity(productId: string, quantity: number) {
      const item = items.value.find(i => i.product.id === productId)
      if (item) {
        if (quantity > 0) {
          item.quantity = quantity
          // 🔥 Сбрасываем бонусы при изменении корзины
          bonusesToSpend.value = 0
        }
        else {
          removeItem(productId)
        }
      }
    }

    async function clearCart() {
      items.value = []
      bonusesToSpend.value = 0
      // Очищаем серверную корзину
      if (user.value) {
        const { error } = await supabase.from('server_carts').upsert(
          {
            user_id: user.value.id,
            items: [] as any,
            total_amount: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        if (error) {
          console.error(
            '[CartStore] Failed to clear server cart:',
            error.message,
          )
        }
      }
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
      bonusesToSpend.value
        = amount > maxPossible ? maxPossible : Math.floor(amount)
    }

    // Синхронизация корзины на сервер (debounced, только для авторизованных)
    function syncToServer() {
      if (!user.value)
        return

      if (syncTimeout.value)
        clearTimeout(syncTimeout.value)
      syncTimeout.value = setTimeout(() => forceSyncToServer(), 500)
    }

    // Немедленная синхронизация без debounce
    async function forceSyncToServer() {
      if (!user.value || isMergingFromServer.value)
        return

      if (syncTimeout.value) {
        clearTimeout(syncTimeout.value)
        syncTimeout.value = null
      }

      const cartItems = items.value.map(i => ({
        product_id: i.product.id,
        quantity: i.quantity,
      }))

      const { error } = await supabase.from('server_carts').upsert(
        {
          user_id: user.value!.id,
          items: cartItems as any,
          total_amount: subtotal.value,
          updated_at: new Date().toISOString(),
          reminder_1h_sent: false,
          reminder_24h_sent: false,
        },
        { onConflict: 'user_id' },
      )

      if (error) {
        console.error('[CartStore] Sync to server failed:', error.message)
      }
    }

    // Загрузка серверной корзины
    async function loadServerCart(): Promise<ICartItem[]> {
      if (!user.value)
        return []

      const { data: serverCart } = await supabase
        .from('server_carts')
        .select('items')
        .eq('user_id', user.value.id)
        .single()

      if (
        !serverCart?.items
        || !Array.isArray(serverCart.items)
        || serverCart.items.length === 0
      ) {
        return []
      }

      const productIds = (
        serverCart.items as Array<{ product_id: string, quantity: number }>
      ).map(i => i.product_id)

      const { data: products, error } = await supabase
        .from('products')
        .select(
          `
        *,
        product_images (
          id,
          image_url,
          blur_placeholder,
          alt_text,
          display_order
        )
      `,
        )
        .in('id', productIds)
        .order('display_order', {
          referencedTable: 'product_images',
          ascending: true,
        })

      if (error || !products)
        return []

      const serverItems: ICartItem[] = []
      for (const serverItem of serverCart.items as Array<{
        product_id: string
        quantity: number
      }>) {
        const product = products.find(p => p.id === serverItem.product_id)
        if (product) {
          serverItems.push({
            product: product as ProductWithImages,
            quantity: serverItem.quantity,
          })
        }
      }

      return serverItems
    }

    // Merge при логине: объединяем локальную и серверную корзины
    async function mergeOnLogin() {
      if (!user.value || hasMergedOnLogin.value)
        return

      isMergingFromServer.value = true
      hasMergedOnLogin.value = true
      try {
        const serverItems = await loadServerCart()

        if (serverItems.length === 0) {
          // Серверная корзина пустая → синхронизируем локальную на сервер
          if (items.value.length > 0) {
            await forceSyncToServer()
          }
          return
        }

        if (items.value.length === 0) {
          // Локальная корзина пустая → загружаем серверную
          items.value = serverItems
          // 🔥 Сбрасываем бонусы при загрузке с сервера
          bonusesToSpend.value = 0
          return
        }

        // Обе корзины не пустые → мерджим (берем максимальное количество)
        const mergedMap = new Map<string, ICartItem>()

        // Добавляем серверные товары
        serverItems.forEach((item) => {
          mergedMap.set(item.product.id, { ...item })
        })

        // Добавляем локальные товары (берем максимум, не суммируем)
        items.value.forEach((localItem) => {
          const existing = mergedMap.get(localItem.product.id)
          if (existing) {
            existing.quantity = Math.max(existing.quantity, localItem.quantity)
          }
          else {
            mergedMap.set(localItem.product.id, { ...localItem })
          }
        })

        items.value = Array.from(mergedMap.values())
        // 🔥 Сбрасываем бонусы после мерджа
        bonusesToSpend.value = 0
        await forceSyncToServer()
      }
      finally {
        isMergingFromServer.value = false
      }
    }

    // Отмена pending sync (для logout)
    function cancelPendingSync() {
      if (syncTimeout.value) {
        clearTimeout(syncTimeout.value)
        syncTimeout.value = null
      }
      hasMergedOnLogin.value = false // Сбрасываем флаг при логауте
    }

    watch([items, () => items.value.map(i => i.quantity)], syncToServer, {
      deep: true,
    })

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

        const isCourierOrder = orderData.deliveryMethod === 'courier'

        let orderId: string | null = null

        // Определяем: гость или авторизованный пользователь
        if (!user.value) {
          // === ГОСТЕВОЙ ЗАКАЗ ===
          if (
            !orderData.guestInfo?.name
            || !orderData.guestInfo?.email
            || !orderData.guestInfo?.phone
          ) {
            throw new Error(
              'Заполните все обязательные поля: имя, email и телефон',
            )
          }

          const { data, error } = await supabase.rpc('create_guest_checkout', {
            p_cart_items: cartItems,
            p_guest_info: orderData.guestInfo,
            p_delivery_method: orderData.deliveryMethod,
            p_delivery_address: orderData.deliveryAddress,
            p_payment_method: orderData.paymentMethod,
            p_promo_code: orderData.promoCode || null,
            p_delivery_cost: orderData.deliveryCost || 0,
            // Комментарий к адресу (подъезд, этаж, домофон). Форма собирала
            // его и раньше, но до RPC он не доезжал и терялся молча.
            // Для авторизованных заказов пока не передаём: у create_user_order
            // такого параметра нет, см. 20260805100000_guest_checkout_comment.
            p_comment: orderData.comment || null,
            // Дату и слот шлём только для курьера: у самовывоза их нет.
            p_delivery_date: isCourierOrder ? deliveryDateIso.value : null,
            p_delivery_slot: isCourierOrder ? deliverySlotLabel.value : null,
            // Пункт нужен только самовывозу; при курьере сервер его всё равно
            // отбросит, но не шлём и отсюда — так понятнее в логах.
            p_pickup_point_id: isCourierOrder ? null : pickupPointId.value,
          })

          if (error)
            throw error
          orderId = data

          toast.success('Заказ успешно оформлен!', {
            description:
              'Спасибо за покупку! Мы свяжемся с вами в ближайшее время. Корзина сохранена для повторных заказов.',
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
            p_promo_code: orderData.promoCode || null,
            p_contact_name: orderData.contactName || null,
            p_contact_phone: orderData.contactPhone || null,
            p_delivery_cost: orderData.deliveryCost || 0,
            p_comment: orderData.comment || null,
            p_delivery_date: isCourierOrder ? deliveryDateIso.value : null,
            p_delivery_slot: isCourierOrder ? deliverySlotLabel.value : null,
            p_pickup_point_id: isCourierOrder ? null : pickupPointId.value,
          })

          if (error)
            throw error
          orderId = data

          const bonusesAwarded = bonusesToAward.value

          // 🔥 КРИТИЧНО: Перезагружаем профиль для обновления бонусов (silent — без лоадера)
          await profileStore.loadProfile(true, false, true)

          // ✅ Принудительно триггерим реактивность через nextTick
          await nextTick()

          toast.success('Заказ успешно создан!', {
            description:
              bonusesAwarded > 0
                ? `Спасибо за покупку! ${bonusesAwarded} бонусов будут начислены на ваш счет и станут активны через 14 дней.`
                : 'Спасибо за покупку!',
            duration: 10000,
          })
        }

        if (!orderId) {
          throw new Error('Не удалось получить ID заказа')
        }

        // 🔥 Google Analytics: Отслеживание покупки
        const { trackPurchase } = useEcommerceTracking()
        trackPurchase(
          orderId,
          items.value.map(item => ({
            id: item.product.id,
            name: item.product.name,
            price: item.product.final_price || item.product.price,
            quantity: item.quantity,
          })),
          total.value,
        )

        // ✅ Очищаем корзину ТОЛЬКО для авторизованных пользователей
        // Для гостей сохраняем корзину в localStorage, чтобы не пришлось заново набирать
        if (user.value) {
          clearCart()
        }

        if (orderId)
          lastOrder.value = { id: orderId, at: new Date().toISOString() }

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
      isCartOpen,
      totalItems,
      subtotal,
      deliveryMethod,
      deliveryAddress,
      pickupPointId,
      deliveryDateIndex,
      deliverySlotIndex,
      deliveryDateIso,
      deliverySlotLabel,
      lastOrder,
      deliveryCost,
      isFreeShipping,
      setDeliveryMethod,
      discountAmount,
      total,
      bonusesToAward,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      checkout,
      setBonusesToSpend,
      mergeOnLogin,
      cancelPendingSync,
    }
  },
  {
    persist: {
      key: CART_STORAGE_KEY,
      // deliveryMethod персистим вместе с корзиной: выбранный на /checkout
      // самовывоз должен пережить возврат на /cart, иначе «Итого» снова
      // разъедется. deliveryAddress — по той же причине: локейшн-панель
      // показывает его на обоих шагах.
      pick: [
        'items',
        'bonusesToSpend',
        'deliveryMethod',
        'deliveryAddress',
        'pickupPointId',
        'deliveryDateIndex',
        'deliverySlotIndex',
        'lastOrder',
      ],
      storage: piniaPluginPersistedstate.localStorage(),
    },
  },
)
