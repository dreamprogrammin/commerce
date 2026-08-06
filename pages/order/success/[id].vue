<script setup lang="ts">
import confetti from 'canvas-confetti'
import { storeToRefs } from 'pinia'
import TelegramBanner from '@/components/profile/TelegramBanner.vue'
// Оба не автоимпортятся: композабл лежит во вложенной папке, константа — в @/constants.
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'
import { orderItemUnitPrice } from '@/utils/orderItems'

definePageMeta({ layout: 'checkout' })

// SEO: Закрываем страницу успешного заказа от индексации
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const cartStore = useCartStore()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)
const personalizationStore = usePersonalizationStore()

const fullOrderId = computed(() => route.params.id as string)
// Короткий номер — те же последние 6 символов, что показывает бот и профиль.
const orderNo = computed(() => fullOrderId.value.slice(-6).toUpperCase())

const isAuthenticated = computed(() => !!user.value)
const hasCartItems = computed(() => cartStore.items.length > 0)

const { cancelOrder, canCancelOrder } = useUserOrders()
const isCancelling = ref(false)
const showCancelDialog = ref(false)

interface OrderItemRow {
  quantity: number
  // Обе формы имени: какая приедет, зависит от окружения — см. utils/orderItems.
  price_at_purchase?: number | null
  price_per_item?: number | null
  product: {
    name: string
    price: number
    final_price: number | null
    product_images: { image_url: string, blur_placeholder: string | null }[]
  } | null
}

interface OrderRow {
  created_at: string
  status: string
  final_amount: number
  delivery_method: string
  payment_method: string | null
  delivery_address: { city?: string, line1?: string } | null
  delivery_date: string | null
  delivery_slot: string | null
  bonuses_awarded: number
  order_items: OrderItemRow[]
}

const order = ref<OrderRow | null>(null)

/**
 * Полные данные заказа грузим только для авторизованных.
 *
 * Гостевой заказ лежит в guest_checkouts, а RLS отдаёт эту таблицу только
 * админам — покупатель-гость собственный заказ прочитать не может. Поэтому
 * в гостевой ветке макета и нет ни состава, ни сумм: там только номер.
 *
 * Позиции берём целиком (`order_items(*)`), а не перечисляя колонки: цена
 * покупки называется price_at_purchase в проде и price_per_item в схеме из
 * миграций, и запрос по имени вернул бы 400 в одном из окружений. Нужное поле
 * выбирает orderItemUnitPrice.
 */
async function fetchOrder() {
  if (!isAuthenticated.value)
    return

  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        created_at,
        status,
        final_amount,
        delivery_method,
        payment_method,
        delivery_address,
        delivery_date,
        delivery_slot,
        bonuses_awarded,
        order_items(
          *,
          product:products(
            name,
            price,
            final_price,
            product_images(image_url, blur_placeholder)
          )
        )
      `,
      )
      .eq('id', fullOrderId.value)
      .single()

    if (error)
      throw error
    order.value = data as unknown as OrderRow
  }
  catch (err) {
    console.error('Ошибка загрузки заказа:', err)
  }
}

const orderDate = computed(() => {
  if (!order.value)
    return ''
  const d = new Date(order.value.created_at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const fulfillLabel = computed(() => {
  if (!order.value)
    return ''
  if (order.value.delivery_method !== 'courier')
    return 'Самовывоз из магазина'

  const addr = order.value.delivery_address
  const place = [addr?.city, addr?.line1].filter(Boolean).join(', ')
  // Желаемое время дописываем к адресу — покупателю важнее «когда», чем «как».
  const when = [order.value.delivery_date
    ? order.value.delivery_date.split('-').reverse().join('.')
    : null, order.value.delivery_slot].filter(Boolean).join(', ')

  return ['Доставка', place, when].filter(Boolean).join(' · ')
})

const PAYMENT_LABELS: Record<string, string> = {
  kaspi: 'Kaspi — перевод или QR',
  cash: 'Наличными при получении',
  card: 'Картой при получении',
}

const payLabel = computed(() =>
  order.value?.payment_method
    ? (PAYMENT_LABELS[order.value.payment_method] ?? order.value.payment_method)
    : 'Не указан',
)

const items = computed(() =>
  (order.value?.order_items ?? []).map((row) => {
    // Цена на момент покупки, а не текущая: если товар с тех пор подорожал
    // или подешевел, список позиций обязан сходиться с «Итого».
    const unit = orderItemUnitPrice(row)
    return {
      name: row.product?.name ?? 'Товар',
      image: row.product?.product_images?.[0]?.image_url ?? null,
      blur: row.product?.product_images?.[0]?.blur_placeholder ?? undefined,
      qtyLabel: `${row.quantity} шт × ${formatPrice(unit)} ₸`,
      lineLabel: `${formatPrice(unit * row.quantity)} ₸`,
    }
  }),
)

async function handleCancelOrder() {
  isCancelling.value = true
  const result = await cancelOrder(fullOrderId.value)

  if (result.success && order.value) {
    order.value.status = 'cancelled'
    showCancelDialog.value = false
  }

  isCancelling.value = false
}

function clearGuestCart() {
  cartStore.clearCart()
  router.push('/')
}

const { getVariantUrl } = useSupabaseStorage()

function imageUrl(path: string | null) {
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'sm') : null
}

onMounted(async () => {
  personalizationStore.invalidate()

  if (isAuthenticated.value)
    await fetchOrder()

  if (navigator.vibrate)
    navigator.vibrate([100, 50, 100])

  // 🎉 Салют из нижних углов — держим от прежней версии страницы.
  const colors = ['#3b82f6', '#facc15', '#ef4444', '#10b981']
  const end = Date.now() + 500

  const frame = () => {
    if (Date.now() > end)
      return

    confetti({ particleCount: 2, angle: 60, spread: 55, origin: { x: 0, y: 1 }, colors })
    confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1, y: 1 }, colors })
    requestAnimationFrame(frame)
  }

  frame()
})
</script>

<template>
  <div class="os-page">
    <div class="mx-auto flex w-full max-w-[920px] flex-col gap-4">
      <!-- ============ ГЕРОЙ ============ -->
      <div class="flex flex-col items-center gap-2.5 px-0 pb-1.5 pt-3 text-center">
        <span class="os-check">
          <Icon name="lucide:check" class="size-9 text-success" />
        </span>
        <h1
          class="text-[clamp(24px,3vw,30px)] font-extrabold leading-[1.2] tracking-[-0.02em] text-primary"
        >
          Спасибо за ваш заказ!
        </h1>
        <p class="text-base leading-[1.5] text-muted-foreground">
          Заказ успешно оформлен
        </p>
      </div>

      <!-- ============ НОМЕР ЗАКАЗА И «ЧТО ДАЛЬШЕ» ============ -->
      <section class="os-card flex flex-col gap-5 p-6">
        <div class="flex flex-col items-center gap-[9px] border-b pb-[18px]">
          <!-- Анимированный герой: своя .lottie и своя подпись на каждый
               статус. В макете здесь стоп-кадр — экспорт прототипа не умеет
               анимации, а не потому что её быть не должно. -->
          <OrderTrackerLottie v-if="order" :status="order.status" />

          <span class="mt-2 text-sm text-muted-foreground">Номер вашего заказа</span>
          <span class="os-number">{{ orderNo }}</span>

          <span
            v-if="orderDate"
            class="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground"
          >
            <Icon name="lucide:calendar" class="size-3.5" />
            {{ orderDate }}
          </span>

          <OrderProgressBar
            v-if="order"
            :status="order.status"
            class="mt-3 max-w-[472px]"
          />
        </div>

        <div class="flex flex-col gap-3">
          <span class="flex items-center gap-2 text-base font-bold">
            <Icon name="lucide:info" class="size-5 text-primary" />
            Что дальше?
          </span>
          <span class="flex flex-col gap-2">
            <span class="flex items-start gap-[9px] text-sm leading-[1.45] text-muted-foreground">
              <span class="leading-[1.45] text-primary">•</span>
              Наш менеджер скоро свяжется с вами для подтверждения деталей заказа
            </span>
            <span class="flex items-start gap-[9px] text-sm leading-[1.45] text-muted-foreground">
              <span class="leading-[1.45] text-primary">•</span>
              Мы отправим уведомление о статусе заказа на указанный номер телефона
            </span>
          </span>
        </div>
      </section>

      <ClientOnly>
        <!-- ============ ГОСТЬ: КОРЗИНА СОХРАНЕНА ============ -->
        <section
          v-if="!isAuthenticated && hasCartItems"
          class="os-card-blue flex flex-col gap-[18px] px-6 py-[22px]"
        >
          <div class="flex items-start gap-[13px]">
            <span class="os-badge os-badge--blue">
              <Icon name="solar:cart-3-bold" class="size-5 text-primary" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span class="text-[17px] font-bold">Корзина сохранена</span>
              <span class="text-sm leading-[1.4] text-muted-foreground">
                Товары в корзине остались, вы можете оформить ещё один заказ или очистить корзину
              </span>
            </span>
          </div>
          <div class="flex items-center gap-2.5">
            <NuxtLink to="/cart" class="os-btn h-11 flex-1">
              <Icon name="solar:cart-3-bold" class="size-[17px]" />
              Перейти в корзину
            </NuxtLink>
            <button
              type="button"
              aria-label="Очистить корзину"
              class="os-btn os-btn--icon size-11 shrink-0"
              @click="clearGuestCart"
            >
              <Icon name="lucide:trash-2" class="size-[17px]" />
            </button>
          </div>
        </section>

        <!-- ============ АВТОРИЗОВАННЫЙ: ОТСЛЕЖИВАНИЕ ============ -->
        <section
          v-if="isAuthenticated"
          class="os-card-green flex flex-col gap-[18px] px-6 py-[22px]"
        >
          <div class="flex items-start gap-[13px]">
            <span class="os-badge os-badge--green">
              <Icon name="lucide:map-pin" class="size-5 text-success" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span class="text-[17px] font-bold">Отслеживайте ваш заказ</span>
              <span class="text-sm leading-[1.4] text-muted-foreground">
                Статус заказа доступен в вашем личном кабинете
              </span>
            </span>
          </div>
          <div class="flex flex-col gap-[9px]">
            <NuxtLink :to="`/profile/order/${fullOrderId}`" class="os-cta h-12">
              <Icon name="lucide:package-search" class="size-[17px]" />
              Перейти к заказу
            </NuxtLink>
            <button
              v-if="order && canCancelOrder(order.status)"
              type="button"
              class="os-btn h-12"
              @click="showCancelDialog = true"
            >
              <Icon name="lucide:x-circle" class="size-[17px]" />
              Отменить заказ
            </button>
          </div>
        </section>

        <!-- ============ ЛЕНТА СТАТУСОВ ============ -->
        <OrderTracker
          v-if="isAuthenticated && order"
          :order-id="fullOrderId"
          :initial-status="order.status"
        />

        <!-- ============ ДЕТАЛИ И СТОИМОСТЬ ============ -->
        <div v-if="order" class="grid gap-4 md:grid-cols-2">
          <section class="os-card p-[22px]">
            <div class="mb-3.5 text-[17px] font-bold">
              Детали заказа
            </div>
            <div class="flex flex-col gap-3.5">
              <div class="flex items-start gap-3">
                <span class="grid size-[38px] shrink-0 place-content-center rounded-[10px] bg-muted">
                  <Icon name="lucide:package" class="size-[19px] text-primary" />
                </span>
                <span class="flex flex-col gap-0.5">
                  <span class="text-[13px] font-bold">Способ получения</span>
                  <span class="text-[13px] text-muted-foreground">{{ fulfillLabel }}</span>
                </span>
              </div>
              <div class="flex items-start gap-3">
                <span class="grid size-[38px] shrink-0 place-content-center rounded-[10px] bg-muted">
                  <Icon name="lucide:credit-card" class="size-[19px] text-primary" />
                </span>
                <span class="flex flex-col gap-0.5">
                  <span class="text-[13px] font-bold">Способ оплаты</span>
                  <span class="text-[13px] text-muted-foreground">{{ payLabel }}</span>
                </span>
              </div>
            </div>
          </section>

          <section class="os-card p-[22px]">
            <div class="mb-3.5 text-[17px] font-bold">
              Стоимость
            </div>
            <div class="mb-3.5 flex items-baseline justify-between">
              <span class="text-[15px] font-bold">Итого</span>
              <b class="text-[22px] font-extrabold">{{ formatPrice(order.final_amount) }} ₸</b>
            </div>
            <div
              v-if="order.bonuses_awarded > 0"
              class="flex items-center justify-between rounded-xl border border-bonus-border bg-bonus-surface px-[13px] py-[11px]"
            >
              <span class="inline-flex items-center gap-1.5 text-[13px] font-bold text-bonus">
                <Icon name="lucide:gift" class="size-[15px]" />
                Начислено бонусов
              </span>
              <b class="text-sm font-extrabold text-bonus">
                +{{ formatPrice(order.bonuses_awarded) }}
              </b>
            </div>
          </section>
        </div>

        <!-- ============ ТОВАРЫ ============ -->
        <section v-if="items.length > 0" class="os-card p-[22px]">
          <div class="mb-1.5 text-[17px] font-bold">
            Товары ({{ items.length }})
          </div>
          <div
            v-for="(item, index) in items"
            :key="index"
            class="flex gap-3.5 border-b border-muted py-3.5"
          >
            <div class="grid size-16 shrink-0 place-content-center overflow-hidden rounded-[10px] bg-muted">
              <ProgressiveImage
                v-if="imageUrl(item.image)"
                :src="imageUrl(item.image)!"
                :alt="item.name"
                aspect-ratio="square"
                object-fit="contain"
                placeholder-type="lqip"
                :blur-data-url="item.blur"
                class="size-full p-[5px]"
              />
            </div>
            <div class="flex min-w-0 flex-1 flex-col justify-center gap-[5px]">
              <span class="line-clamp-2 text-[13px] font-semibold leading-[1.35]">
                {{ item.name }}
              </span>
              <span class="text-xs text-muted-foreground">{{ item.qtyLabel }}</span>
            </div>
            <b class="shrink-0 self-center whitespace-nowrap text-[15px] font-extrabold">
              {{ item.lineLabel }}
            </b>
          </div>
        </section>

        <TelegramBanner v-if="isAuthenticated && !profile?.telegram_chat_id" />
      </ClientOnly>

      <!-- ============ НА ГЛАВНУЮ ============ -->
      <div class="flex justify-center px-0 pb-1 pt-2.5">
        <NuxtLink to="/" class="os-btn h-12 px-[26px]">
          <Icon name="lucide:home" class="size-[17px]" />
          Вернуться на главную
        </NuxtLink>
      </div>
    </div>

    <AlertDialog v-model:open="showCancelDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить заказ?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы уверены, что хотите отменить заказ №{{ orderNo }}? <br><br>
            Потраченные бонусы будут возвращены на ваш счёт.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isCancelling">
            Нет, оставить
          </AlertDialogCancel>
          <AlertDialogAction
            :disabled="isCancelling"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleCancelOrder"
          >
            <span v-if="isCancelling">Отменяем...</span>
            <span v-else>Да, отменить</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style scoped>
/* Страница успеха в макете лежит на сером полотне, а не на белом. */
.os-page {
  min-height: 100%;
  background: var(--page-surface);
  padding: 24px clamp(14px, 4vw, 24px) 40px;
}

/* Зелёный кружок с галочкой. Значения литералами, а не через var(--color-*):
   Tailwind 4 выкидывает переменную темы, если её не использует утилита. */
.os-check {
  display: grid;
  place-content: center;
  width: 72px;
  height: 72px;
  border-radius: 999px;
  background: linear-gradient(150deg, rgb(220 252 231 / 0.95), rgb(185 248 207 / 0.6));
  border: 1px solid rgb(0 166 62 / 0.28);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.95),
    inset 0 -3px 8px rgb(3 84 63 / 0.1),
    0 8px 20px rgb(0 166 62 / 0.16);
}

.os-card {
  border-radius: 22px;
  background: var(--background);
  border: 1px solid var(--border);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.98),
    inset 0 -2px 4px rgb(15 23 42 / 0.07),
    0 1px 0 rgb(15 23 42 / 0.05);
}

.os-card-blue {
  border-radius: 22px;
  background: linear-gradient(162deg, rgb(239 246 255 / 0.98), rgb(219 234 254 / 0.55));
  border: 1px solid rgb(191 219 254 / 0.95);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.95),
    inset 0 -2px 6px rgb(6 53 138 / 0.06),
    0 1px 0 rgb(15 23 42 / 0.04);
}

.os-card-green {
  border-radius: 22px;
  background: linear-gradient(162deg, rgb(240 253 244 / 0.98), rgb(220 252 231 / 0.55));
  border: 1px solid rgb(185 248 207 / 0.9);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.95),
    inset 0 -2px 6px rgb(3 84 63 / 0.06),
    0 1px 0 rgb(15 23 42 / 0.04);
}

.os-badge {
  flex: none;
  display: grid;
  place-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.9);
}
.os-badge--blue {
  background: rgb(219 234 254 / 0.95);
  border: 1px solid rgb(43 127 255 / 0.24);
}
.os-badge--green {
  background: rgb(220 252 231 / 0.95);
  border: 1px solid rgb(0 166 62 / 0.24);
}

/* Плашка с номером заказа. */
.os-number {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 18px;
  border-radius: 14px;
  background: var(--page-surface);
  border: 1px solid var(--border);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.95),
    inset 0 -2px 5px rgb(15 23 42 / 0.06);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.01em;
}

/* Белая кнопка-«стекло» — та же поверхность, что у карточек. */
.os-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--background);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.98),
    inset 0 -2px 4px rgb(15 23 42 / 0.07),
    0 1px 0 rgb(15 23 42 / 0.05);
  color: var(--foreground);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.15s ease;
}
.os-btn:hover {
  color: var(--primary);
}
.os-btn--icon:hover {
  color: var(--destructive);
}

/* Синяя кнопка — общая с CTA корзины и оформления. */
.os-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  border: 1px solid rgb(255 255 255 / 0.45);
  background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    inset 0 -2px 8px rgb(6 53 138 / 0.28),
    0 8px 20px rgb(43 127 255 / 0.3);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease;
}
.os-cta:hover {
  background: linear-gradient(150deg, rgb(96 163 255 / 1), rgb(29 112 246 / 0.92));
  color: #fff;
}
</style>
