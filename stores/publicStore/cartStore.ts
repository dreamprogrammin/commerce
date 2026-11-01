import type { Database, ICheckoutData, ProductWithImages } from '@/types'
import type { CartLine, ServerSyncMark } from '@/utils/cartSync'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT, COURIER_DELIVERY_COST, FREE_SHIPPING_THRESHOLD } from '@/constants'
import { cartSignature, decideCartSync, mergeCartLines } from '@/utils/cartSync'
import {
  buildDeliveryDates,
  clampIndex,
  DELIVERY_DATE_COUNT,
  DELIVERY_SLOTS,
} from '@/utils/deliverySlots'
import { useProfileStore } from '../core/profileStore'

/**
 * `post` — посылка в другой город, Kazpost или CDEK (с 19 октября 2026).
 * Цену такой доставки называют после взвешивания; сервер (`calc_delivery_cost`)
 * ставит 0 всему, что не `courier`, — в сумму заказа она не входит.
 */
export type DeliveryMethod = 'pickup' | 'courier' | 'post'

const CART_STORAGE_KEY = 'uhti-cart-v1'

export interface ICartItem {
  product: ProductWithImages
  quantity: number
}

export const useCartStore = defineStore(
  'cartStore',
  () => {
    const supabase = useSupabaseClient<Database>()
    const { getVariantUrl } = useSupabaseStorage()
    const { cartAdded, cartRemoved } = useToasts()

    /**
     * Картинка товара для тоста — самый мелкий вариант: он уже скачан
     * карточкой, и тост показывает его из кеша, не занимая канал.
     */
    function thumbUrl(product: ProductWithImages): string | null {
      const path = product.product_images?.[0]?.image_url
      if (!path)
        return null
      return getVariantUrl(BUCKET_NAME_PRODUCT, path, 'sm')
    }
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
    /**
     * Какую версию серверной корзины отражает эта (1.11.2026, utils/cartSync.ts).
     * Живёт в localStorage рядом с корзиной: по ней сверка решает, взять
     * серверную целиком или объединить.
     */
    const serverSync = ref<ServerSyncMark | null>(null)
    /*
     * В этой вкладке ещё не сверялись с сервером — своё не отправляем: правка
     * из восстановленной корзины затёрла бы то, что положили в другом браузере.
     * Не persist: каждая загрузка страницы сверяется заново.
     */
    let serverSyncedThisPage = false
    let serverSyncInFlight: Promise<void> | null = null
    /**
     * Номер гостевой корзины на сервере (31.10.2026): владелец хотел видеть,
     * что кладут в корзину и гости. Случайный, без имени; живёт в localStorage
     * рядом с корзиной (persist). Заводится при первой синхронизации.
     */
    const guestCartId = ref<string | null>(null)
    const isCartOpen = ref(false) // 🔥 Управление состоянием шторки корзины

    const toLine = (item: ICartItem): CartLine => ({ productId: item.product.id, quantity: itemQuantity(item) })

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
     * Посылке — 0, как и на сервере: её цену называют после взвешивания,
     * и показывать её надо словами (`isDeliveryByWeight`), а не «Бесплатно».
     */
    const deliveryCost = computed(() => {
      if (deliveryMethod.value !== 'courier')
        return 0
      return subtotal.value >= FREE_SHIPPING_THRESHOLD
        ? 0
        : COURIER_DELIVERY_COST
    })

    const isDeliveryByWeight = computed(() => deliveryMethod.value === 'post')
    const isFreeShipping = computed(() => deliveryCost.value === 0 && !isDeliveryByWeight.value)

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

    /*
     * Отправка событий корзины в GA4 живёт ЗДЕСЬ, а не в компонентах.
     *
     * Раньше `trackAddToCart` звал только `ProductCard`, то есть карточка в
     * списке. Главная кнопка «В корзину» на странице товара, аксессуары,
     * «товар дня» и повтор заказа из кабинета не отправляли ничего. В GA4 это
     * выглядело так (28 дней, замер 21 августа 2026):
     *
     *   view_item 42 → add_to_cart 1 → begin_checkout 10 → purchase 4
     *
     * Добавлений меньше, чем начатых оформлений, — цифра невозможная, и
     * переход «каталог → корзина» измерить было нельзя вовсе.
     *
     * В сторе это ловится один раз и навсегда: любой путь добавления проходит
     * через `addItem`, а удаления — через `removeItem`. Компонент, добавленный
     * завтра, попадёт в статистику сам, без напоминания.
     *
     * Почему тут безопасно: `addItem` — исключительно действие покупателя, он
     * показывает тост и открывает корзину. Восстановление корзины из
     * localStorage идёт мимо него, через `persist`, поэтому ложных событий на
     * загрузке страницы не будет.
     *
     * Цена берётся как `final_price || price` — та же формула, что уже
     * используется здесь для `purchase`, иначе события разошлись бы в деньгах.
     */
    function trackAdded(product: ProductWithImages, quantity: number) {
      const { trackAddToCart } = useEcommerceTracking()
      trackAddToCart({
        id: product.id,
        name: product.name,
        price: product.final_price || product.price,
        quantity,
      })
    }

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
        cartAdded(existingItem.product.name, thumbUrl(existingItem.product))
        // 🔥 Открываем корзину при добавлении товара
        isCartOpen.value = true
        // 🔥 Сбрасываем бонусы при изменении корзины
        bonusesToSpend.value = 0
        trackAdded(existingItem.product, quantity)
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
          cartAdded(fullProduct.name, thumbUrl(fullProduct as ProductWithImages))
          // 🔥 Открываем корзину при добавлении нового товара
          isCartOpen.value = true
          // 🔥 Сбрасываем бонусы при изменении корзины
          bonusesToSpend.value = 0
          trackAdded(fullProduct as ProductWithImages, quantity)
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

    /**
     * Вернуть удалённую позицию на место — из тоста «Вернуть».
     *
     * Кладётся снимок, а не повторное добавление: `addItem` сходил бы за
     * товаром в базу и отправил бы add_to_cart, а возврат отменённого
     * удаления покупкой не является — в отчётах вышла бы лишняя пара
     * событий.
     */
    function restoreItem(item: ICartItem, index: number) {
      if (items.value.some(i => i.product.id === item.product.id))
        return
      items.value.splice(Math.min(index, items.value.length), 0, item)
      bonusesToSpend.value = 0
    }

    function removeItem(productId: string) {
      // Ищем ДО фильтрации: после неё имени и цены для события уже не будет.
      const index = items.value.findIndex(i => i.product.id === productId)
      const removed = index >= 0 ? items.value[index] : undefined

      items.value = items.value.filter(i => i.product.id !== productId)
      if (removed) {
        cartRemoved(
          removed.product.name,
          () => restoreItem(removed, index),
          thumbUrl(removed.product),
        )
      }
      else {
        toast.info('Товар удалён из корзины')
      }
      // 🔥 Сбрасываем бонусы при изменении корзины
      bonusesToSpend.value = 0

      /*
       * Та же история, что с добавлением: `trackRemoveFromCart` звали только
       * `ProductCard` и `QuantitySelector`, а удаление из корзины и из
       * слайд-панели не отправляло ничего.
       *
       * `clearCart` сюда не заходит — он обнуляет `items` напрямую. И это
       * правильно: очистка после оформления заказа не должна выглядеть как
       * отказ покупателя от товаров.
       */
      if (removed) {
        const { trackRemoveFromCart } = useEcommerceTracking()
        trackRemoveFromCart({
          id: removed.product.id,
          name: removed.product.name,
          price: removed.product.final_price || removed.product.price,
          quantity: removed.quantity,
        })
      }
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
        const userId = user.value.id
        const { data, error } = await supabase.from('server_carts').upsert(
          {
            user_id: userId,
            items: [] as any,
            total_amount: 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        ).select('updated_at').single()
        if (error) {
          console.error(
            '[CartStore] Failed to clear server cart:',
            error.message,
          )
        }
        else {
          serverSync.value = { userId, at: data.updated_at, signature: '' }
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

    // Синхронизация корзины на сервер (debounced): вошедшего — в server_carts,
    // гостя — в guest_carts по номеру браузера
    function syncToServer() {
      if (syncTimeout.value)
        clearTimeout(syncTimeout.value)
      if (!user.value) {
        // 1,5 с — база принимает гостевую корзину не чаще раза в секунду
        syncTimeout.value = setTimeout(() => syncGuestCart(), 1500)
        return
      }
      syncTimeout.value = setTimeout(() => forceSyncToServer(), 500)
    }

    /**
     * Гостевая корзина — только номера товаров и количество; цены и сумму база
     * считает сама (`save_guest_cart`). Пустая — удаляет запись. Ошибка не
     * мешает покупке: корзина гостя по-прежнему живёт в браузере.
     */
    async function syncGuestCart() {
      syncTimeout.value = null
      if (user.value || import.meta.server)
        return
      if (!guestCartId.value) {
        if (!items.value.length)
          return
        guestCartId.value = crypto.randomUUID()
      }
      const { error } = await supabase.rpc('save_guest_cart' as never, {
        p_cart_id: guestCartId.value,
        p_items: items.value.map(i => ({ product_id: i.product.id, quantity: i.quantity })),
      } as never)
      if (error)
        console.warn('[CartStore] Guest cart sync failed:', error.message)
    }

    /**
     * Отправить корзину на сервер. Без `force` — только после сверки в этой
     * вкладке и только если состав отличается от того, что сервер уже знает
     * (иначе это эхо сверки или корзина, восстановленная из localStorage).
     */
    async function forceSyncToServer(force = false, userId = user.value?.id) {
      if (!userId)
        return

      if (syncTimeout.value) {
        clearTimeout(syncTimeout.value)
        syncTimeout.value = null
      }

      const lines = items.value.map(toLine)
      const signature = cartSignature(lines)
      const mark = serverSync.value?.userId === userId ? serverSync.value : null
      if (!force && (!serverSyncedThisPage || mark?.signature === signature))
        return

      const { data, error } = await supabase.from('server_carts').upsert(
        {
          user_id: userId,
          items: lines.map(l => ({ product_id: l.productId, quantity: l.quantity })) as any,
          total_amount: subtotal.value,
          updated_at: new Date().toISOString(),
          reminder_1h_sent: false,
          reminder_24h_sent: false,
        },
        { onConflict: 'user_id' },
      ).select('updated_at').single()

      if (error) {
        console.error('[CartStore] Sync to server failed:', error.message)
        return
      }
      serverSync.value = { userId, at: data.updated_at, signature }
    }

    /** Строки серверной корзины → позиции с товарами. Удалённых товаров нет. */
    async function hydrateServerItems(raw: unknown): Promise<ICartItem[]> {
      const lines = (Array.isArray(raw) ? raw : []) as Array<{ product_id: string, quantity: number }>
      if (!lines.length)
        return []

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
        .in('id', lines.map(l => l.product_id))
        .order('display_order', {
          referencedTable: 'product_images',
          ascending: true,
        })

      if (error || !products)
        return []

      const result: ICartItem[] = []
      for (const line of lines) {
        const product = products.find(p => p.id === line.product_id)
        if (product)
          result.push({ product: product as ProductWithImages, quantity: line.quantity })
      }
      return result
    }

    function applyServerItems(list: ICartItem[], userId: string, at: string) {
      const signature = cartSignature(list.map(toLine))
      if (signature !== cartSignature(items.value.map(toLine))) {
        items.value = list
        // Состав сменился — списание бонусов считается заново
        bonusesToSpend.value = 0
      }
      serverSync.value = { userId, at, signature }
    }

    /**
     * Сверка с серверной корзиной (1.11.2026): при входе, при открытии сайта
     * уже вошедшим и при возврате на вкладку (plugins/auth-init.client.ts).
     * Что делать — решает `decideCartSync`. Одновременные вызовы — один.
     */
    function syncWithServer(userId = user.value?.id): Promise<void> {
      if (import.meta.server || !userId)
        return Promise.resolve()
      serverSyncInFlight ??= runServerSync(userId).finally(() => {
        serverSyncInFlight = null
      })
      return serverSyncInFlight
    }

    async function runServerSync(userId: string) {
      const { data: row, error } = await supabase
        .from('server_carts')
        .select('items, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        console.warn('[CartStore] Server cart read failed:', error.message)
        return
      }

      const action = decideCartSync({
        userId,
        mark: serverSync.value,
        server: row ? { at: row.updated_at } : null,
        local: items.value.map(toLine),
      })
      serverSyncedThisPage = true
      if (action === 'nothing')
        return
      // Без серверной корзины решение — только «отправить» или «ничего»
      if (action === 'push' || !row) {
        await forceSyncToServer(true, userId)
        return
      }

      const serverItems = await hydrateServerItems(row.items)
      if (action === 'take-server') {
        applyServerItems(serverItems, userId, row.updated_at)
        return
      }

      // Объединение: серверные позиции свежее, локальные добавляются
      const byId = new Map([...items.value, ...serverItems].map(i => [i.product.id, i]))
      const merged = mergeCartLines(serverItems.map(toLine), items.value.map(toLine))
        .map(l => ({ ...byId.get(l.productId)!, quantity: l.quantity }))
      if (cartSignature(merged.map(toLine)) === cartSignature(serverItems.map(toLine))) {
        applyServerItems(serverItems, userId, row.updated_at)
        return
      }
      items.value = merged
      bonusesToSpend.value = 0
      await forceSyncToServer(true, userId)
    }

    // Отмена pending sync (для logout)
    function cancelPendingSync() {
      if (syncTimeout.value) {
        clearTimeout(syncTimeout.value)
        syncTimeout.value = null
      }
      // Следующий вход сверится заново, как впервые: объединит, а не заменит
      serverSync.value = null
      serverSyncedThisPage = false
    }

    watch([items, () => items.value.map(i => i.quantity)], syncToServer, {
      deep: true,
    })

    /*
     * Вошёл — гостевая запись больше не нужна: корзина живёт в server_carts с
     * именем, иначе в спросе она посчиталась бы дважды. Через наблюдение за
     * пользователем: так запись убирается при любом его появлении — и при
     * входе, и при открытии сайта уже вошедшим (INITIAL_SESSION).
     */
    // guestCartId — тоже: persist подставляет его из localStorage уже после setup
    watch([user, guestCartId], ([u]) => {
      if (!u || !guestCartId.value || import.meta.server)
        return
      const id = guestCartId.value
      guestCartId.value = null
      supabase.rpc('save_guest_cart' as never, { p_cart_id: id, p_items: [] } as never)
        .then(({ error }) => error && console.warn('[CartStore] Guest cart cleanup failed:', error.message))
    }, { immediate: true })

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
            // Пункт нужен только самовывозу; при доставке сервер его всё равно
            // отбросит, но не шлём и отсюда — так понятнее в логах.
            p_pickup_point_id: orderData.deliveryMethod === 'pickup' ? pickupPointId.value : null,
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
            p_pickup_point_id: orderData.deliveryMethod === 'pickup' ? pickupPointId.value : null,
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

        // Остаток на карточках проданных товаров — сразу, а не через сутки
        // кеша страниц (server/api/revalidate-order.post.ts). В фоне.
        $fetch('/api/revalidate-order', { method: 'POST', body: { orderId } }).catch(() => {})

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
      isDeliveryByWeight,
      isFreeShipping,
      setDeliveryMethod,
      discountAmount,
      total,
      bonusesToAward,
      addItem,
      removeItem,
      restoreItem,
      updateQuantity,
      clearCart,
      checkout,
      setBonusesToSpend,
      syncWithServer,
      cancelPendingSync,
      guestCartId,
      serverSync,
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
        'guestCartId',
        'serverSync',
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
