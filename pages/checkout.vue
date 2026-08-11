<script setup lang="ts">
// Иконки через Nuxt Icon — не тянут весь пакет lucide в бандл
import { vMaska } from 'maska/vue'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { FREE_SHIPPING_THRESHOLD } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { usePromoCodeStore } from '@/stores/publicStore/promoCodeStore'
import {
  buildDeliveryDates,
  DELIVERY_SLOT_DURATION,
  DELIVERY_SLOTS,
} from '@/utils/deliverySlots'
import { formatPrice } from '@/utils/formatPrice'

definePageMeta({ layout: 'checkout' })

// SEO: Закрываем страницу оформления заказа от индексации
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const supabase = useSupabaseClient()
const authStore = useAuthStore()
const cartStore = useCartStore()
const profileStore = useProfileStore()
const promoCodeStore = usePromoCodeStore()
const modalStore = useModalStore()
const { triggerHaptic } = useHaptic()

const { user, isLoggedIn } = storeToRefs(authStore)
const { bonusBalance } = storeToRefs(profileStore)
const {
  subtotal,
  discountAmount,
  items,
  totalItems,
  isProcessing,
  bonusesToSpend,
  bonusesToAward,
  deliveryMethod,
  deliveryCost,
  deliveryDateIndex,
  deliverySlotIndex,
  pickupPointId,
} = storeToRefs(cartStore)

const orderForm = ref({
  name: '',
  phone: '',
  email: '',
  paymentMethod: 'kaspi' as 'kaspi' | 'cash' | 'card',
  comment: '',
})

// Адрес живёт в cartStore: его же читает мобильная локейшн-панель из layout,
// которая висит и над корзиной, и над оформлением.
const { deliveryAddress } = storeToRefs(cartStore)
const bonusesInput = ref(0)
const promoCodeInput = ref('')
const showGuestModal = ref(false)
const agreedToTerms = ref(true)
const hasTriedSubmit = ref(false)

const {
  appliedCode: appliedPromoCode,
  discountAmount: promoDiscount,
  isValidating: isPromoValidating,
} = storeToRefs(promoCodeStore)

async function applyPromoCode() {
  await promoCodeStore.validateCode(promoCodeInput.value, subtotal.value)
}

function clearPromoCode() {
  promoCodeStore.clearCode()
  promoCodeInput.value = ''
}

// Маска для телефона (как в Kaspi)
const phoneMaskOptions = reactive({
  mask: '+7 (###) ###-##-##',
  eager: false, // Маска появляется только при вводе
})

// При фокусе показываем +7 если поле пустое
function handlePhoneFocus() {
  if (!orderForm.value.phone) {
    orderForm.value.phone = '+7 '
  }
}

// При потере фокуса очищаем если только +7
function handlePhoneBlur() {
  const trimmed = orderForm.value.phone.trim()
  if (trimmed === '+7' || trimmed === '+7 (' || trimmed === '+7 ()') {
    orderForm.value.phone = ''
  }
}

// Валидация email
const isValidEmail = computed(() => {
  const email = orderForm.value.email
  if (!email)
    return true
  return /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)
})

// Валидация имени (минимум 2 символа)
const isValidName = computed(() => {
  const name = orderForm.value.name.trim()
  if (!name)
    return true
  return name.length >= 2
})

// Извлекаем только цифры из номера телефона
const phoneDigits = computed(() => orderForm.value.phone.replace(/\D/g, ''))

// Валидация казахстанского мобильного телефона
const isValidPhone = computed(() => {
  const digits = phoneDigits.value
  if (!digits)
    return true

  // Должно быть ровно 11 цифр
  if (digits.length !== 11)
    return false

  // Должно начинаться с 7
  if (!digits.startsWith('7'))
    return false

  // Проверка мобильных кодов: 70X, 74X, 75X, 76X, 77X, 78X
  const mobileCode = digits.substring(1, 3)
  const validCodes = ['70', '74', '75', '76', '77', '78']

  return validCodes.includes(mobileCode)
})

// Сообщение об ошибке для телефона
const phoneErrorMessage = computed(() => {
  const digits = phoneDigits.value
  if (!digits)
    return ''

  if (digits.length < 11) {
    return 'Введите полный номер телефона'
  }

  if (!digits.startsWith('7')) {
    return 'Номер должен начинаться с +7'
  }

  const mobileCode = digits.substring(1, 3)
  const validCodes = ['70', '74', '75', '76', '77', '78']

  if (!validCodes.includes(mobileCode)) {
    return 'Неверный код оператора (700-709, 747-749, 750-759, 760-769, 770-779, 780-789)'
  }

  return ''
})

// Способ получения и стоимость доставки живут в cartStore — то же значение
// видит /cart, поэтому «Итого» на двух шагах больше не расходится.
const isCourier = computed(() => deliveryMethod.value === 'courier')

/**
 * Даты пересобираем на клиенте после монтирования, а не на сервере: «сегодня»
 * у SSR и у покупателя может отличаться, и подпись «Сегодня, 5 августа»
 * разъехалась бы при гидратации.
 */
/**
 * Пункты самовывоза. Список публичный — RLS отдаёт только опубликованные,
 * поэтому отдельной фильтрации здесь не нужно.
 */
const pickupPoints = ref<{
  id: string
  name: string
  address: string
  working_hours: string | null
  note: string | null
}[]>([])

async function loadPickupPoints() {
  const { data, error } = await supabase
    .from('pickup_points')
    .select('id, name, address, working_hours, note')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('Не удалось загрузить пункты самовывоза:', error)
    return
  }

  pickupPoints.value = (data ?? []) as typeof pickupPoints.value

  // Сохранённый выбор мог указывать на снятый с публикации пункт — тогда
  // сбрасываем, иначе покупатель оформил бы заказ на несуществующий адрес.
  if (pickupPointId.value && !pickupPoints.value.some(p => p.id === pickupPointId.value))
    pickupPointId.value = null

  if (!pickupPointId.value && pickupPoints.value.length === 1)
    pickupPointId.value = pickupPoints.value[0].id
}

const deliveryDates = ref(buildDeliveryDates())
onMounted(() => {
  deliveryDates.value = buildDeliveryDates()
  loadPickupPoints()
})

/**
 * Бонусы за заказ без привязки к авторизации — как potentialBonuses в
 * pages/cart.vue. cartStore.bonusesToAward обнуляется для гостя, но в макете
 * мобильная панель показывает bonusEarnShort всем: для гостя это приманка
 * «вот сколько вы теряете», а не факт начисления.
 */
const potentialBonuses = computed(() =>
  items.value.reduce((sum, item) => {
    const award = Number(item.product.bonus_points_award) || 0
    const quantity = Number(item.quantity) || 0
    return sum + award * quantity
  }, 0),
)

/**
 * Итог по формуле макета: товары − промокод − бонусы + доставка.
 *
 * Промокод сюда вернулся вместе с починкой сервера. Раньше обе RPC искали код
 * в promo_campaigns — таблице про маркетинговые акции, где колонки code нет:
 * у авторизованного заказ падал, у гостя скидка молча терялась. Поэтому
 * вычитать её на клиенте было нельзя, показанная сумма разошлась бы с
 * записанной. Теперь скидку считает redeem_promo_code от суммы корзины —
 * ровно так же, как validate_promo_code считает её для показа.
 *
 * Порядок важен: бонусами добивают остаток после промокода, не наоборот.
 */
const orderTotal = computed(() => {
  const afterPromo = Math.max(0, subtotal.value - promoDiscount.value)
  return Math.max(0, afterPromo - discountAmount.value) + deliveryCost.value
})

// --- БОНУСЫ ---
const maxBonuses = computed(() =>
  Math.min(
    bonusBalance.value,
    Math.floor(Math.max(0, subtotal.value - promoDiscount.value)),
  ),
)

/*
 * Промокод почти всегда применяют ПОСЛЕ того, как выставили бонусы. maxBonuses
 * при этом падает, а bonusesToSpend оставался прежним — и уезжал на сервер
 * как есть.
 *
 * Сервер в этом случае режет скидку (`LEAST(p_bonuses_to_spend,
 * v_total_price - v_promo_discount)`), но списывает с баланса полную
 * запрошенную сумму. Разница сгорала молча: заказ на 1090 ₸ с промокодом
 * −327 ₸ и 1090 бонусами давал скидку бонусами 763 ₸, а с баланса уходило
 * 1090 — проверено запуском create_user_order на локальной базе.
 *
 * Здесь закрывается путь через интерфейс. Само списание на сервере тоже
 * надо чинить — это отдельная миграция.
 */
watch(maxBonuses, (limit) => {
  if (bonusesToSpend.value > limit) {
    cartStore.setBonusesToSpend(limit)
    bonusesInput.value = bonusesToSpend.value
  }
})

const useBonuses = computed(() => bonusesToSpend.value > 0)

function toggleBonuses() {
  if (useBonuses.value) {
    cartStore.setBonusesToSpend(0)
    bonusesInput.value = 0
    return
  }
  cartStore.setBonusesToSpend(maxBonuses.value)
  bonusesInput.value = bonusesToSpend.value
}

// Проверка готовности формы к отправке
const isFormValid = computed(() => {
  const { name, email, phone } = orderForm.value

  // Базовые поля
  if (!name.trim() || !email.trim() || !phone.trim())
    return false
  if (!isValidName.value || !isValidEmail.value || !isValidPhone.value)
    return false

  // Адрес для курьера
  if (isCourier.value && !deliveryAddress.value.line1.trim())
    return false

  // Самовывоз без выбранного пункта — только если их вообще нет в справочнике
  if (!isCourier.value && pickupPoints.value.length > 0 && !pickupPointId.value)
    return false

  // Согласие с условиями
  if (!agreedToTerms.value)
    return false

  return true
})

// Предупреждение об адресе показываем только после попытки оформить —
// подсвечивать пустое поле сразу при открытии страницы незачем.
const showAddrWarn = computed(
  () =>
    hasTriedSubmit.value
    && isCourier.value
    && !deliveryAddress.value.line1.trim(),
)

// Предзаполнение формы
watch(
  () => profileStore.profile,
  (newProfile) => {
    if (newProfile) {
      orderForm.value.name
        = `${newProfile.first_name || ''} ${newProfile.last_name || ''}`.trim()
      orderForm.value.phone = newProfile.phone || ''
    }
    if (user.value) {
      orderForm.value.email = user.value.email || ''
    }
  },
  { immediate: true },
)

// Модалка для гостей (один раз за сессию)
const hasSeenModalKey = 'guest_bonus_modal_seen'

onMounted(() => {
  const hasSeenModal = sessionStorage.getItem(hasSeenModalKey)

  if (!isLoggedIn.value && items.value.length > 0 && !hasSeenModal) {
    setTimeout(() => {
      showGuestModal.value = true
      sessionStorage.setItem(hasSeenModalKey, 'true')
    }, 800)
  }
})

function applyBonuses() {
  // Проверка 1: Достаточно ли бонусов на балансе
  if (bonusesInput.value > bonusBalance.value) {
    toast.error('Недостаточно бонусов', {
      description: `У вас доступно только ${bonusBalance.value} бонусов`,
    })
    bonusesInput.value = bonusBalance.value
    return
  }

  // Проверка 2: Не превышают ли бонусы стоимость заказа
  if (bonusesInput.value > maxBonuses.value) {
    toast.warning('Слишком много бонусов', {
      description: `Максимум для этого заказа: ${maxBonuses.value} бонусов (стоимость корзины)`,
    })
    bonusesInput.value = maxBonuses.value
    cartStore.setBonusesToSpend(maxBonuses.value)
    return
  }

  cartStore.setBonusesToSpend(bonusesInput.value)
  bonusesInput.value = bonusesToSpend.value

  if (bonusesToSpend.value > 0) {
    toast.success(`${bonusesToSpend.value} бонусов применено!`, {
      description: `Скидка: ${bonusesToSpend.value} ₸`,
    })
  }
}

async function placeOrder() {
  hasTriedSubmit.value = true

  // Валидация обязательных полей
  if (
    !orderForm.value.name.trim()
    || !orderForm.value.email.trim()
    || !orderForm.value.phone.trim()
  ) {
    toast.error('Заполните все обязательные поля')
    return
  }

  // Валидация имени
  if (!isValidName.value) {
    toast.error('Имя должно содержать минимум 2 символа')
    return
  }

  // Валидация телефона
  if (!isValidPhone.value) {
    toast.error(
      phoneErrorMessage.value
      || 'Введите корректный казахстанский мобильный номер',
    )
    return
  }

  // Валидация email
  if (!isValidEmail.value) {
    toast.error('Введите корректный email')
    return
  }

  // Адрес обязателен для курьера
  if (isCourier.value && !deliveryAddress.value.line1.trim()) {
    toast.error('Укажите адрес доставки')
    return
  }

  // Форматируем номер для отправки в бэк: +77771234567
  const formattedPhone = `+${phoneDigits.value}`

  // Для залогиненных: сохраняем телефон в профиль, если он отсутствует или изменился
  if (isLoggedIn.value && profileStore.profile?.phone !== formattedPhone) {
    await profileStore.updateProfile(
      { phone: formattedPhone },
      { silent: true },
    )
  }

  // Для гостей обязательны данные
  const guestInfo = !isLoggedIn.value
    ? {
        name: orderForm.value.name.trim(),
        email: orderForm.value.email.trim(),
        phone: formattedPhone, // Отправляем в формате +77771234567
      }
    : undefined

  await cartStore.checkout({
    deliveryMethod: deliveryMethod.value,
    paymentMethod: orderForm.value.paymentMethod,
    deliveryAddress: isCourier.value
      ? {
          line1: deliveryAddress.value.line1,
          city: deliveryAddress.value.city,
        }
      : undefined,
    guestInfo,
    promoCode: appliedPromoCode.value || undefined,
    contactName: isLoggedIn.value
      ? orderForm.value.name.trim() || undefined
      : undefined,
    contactPhone: isLoggedIn.value ? formattedPhone : undefined,
    comment: orderForm.value.comment.trim() || undefined,
    deliveryCost: deliveryCost.value,
  })

  // Вибрация при успешном оформлении заказа
  triggerHaptic('success')

  // Очищаем промокод после успешного заказа
  promoCodeStore.clearCode()
}

const PAYMENT_METHODS = [
  {
    key: 'kaspi' as const,
    name: 'Kaspi — перевод или QR',
    desc: 'Оплата после подтверждения заказа',
    icon: 'lucide:smartphone',
    tint: 'bg-red-50 text-red-600',
  },
  {
    key: 'cash' as const,
    name: 'Наличными при получении',
    desc: 'Курьеру или в пункте самовывоза',
    icon: 'lucide:banknote',
    tint: 'bg-green-50 text-green-600',
  },
  {
    key: 'card' as const,
    name: 'Картой при получении',
    desc: 'Оплата картой курьеру',
    icon: 'lucide:credit-card',
    tint: 'bg-blue-50 text-blue-600',
  },
]

const containerClass = carouselContainerVariants({ contained: 'always' })

/**
 * Липкая CTA-панель едет вниз синхронно с MobileBottomNav, поэтому пороги
 * скролла здесь скопированы из него один в один: своя эвристика уводила
 * панель и навигацию в разные стороны на одном и том же жесте.
 */
const isNavVisible = ref(true)
let lastScrollY = 0
let ticking = false

function applyScroll() {
  ticking = false
  const y = window.scrollY
  const dy = y - lastScrollY
  if (dy > 6 && y > 280)
    isNavVisible.value = false
  else if (dy < -6 || y < 120)
    isNavVisible.value = true
  lastScrollY = y
}

function handleScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
  <div :class="`${containerClass} py-6 sm:py-8`">
    <div class="mx-auto w-full max-w-[1200px]">
      <!-- Модалка для гостей -->
      <GuestBonusModal v-model:open="showGuestModal" />

      <!-- ============ КОРЗИНА ПУСТА ============ -->
      <div
        v-if="items.length === 0"
        class="flex flex-col items-center gap-3.5 px-6 py-12 text-center"
      >
        <span class="grid size-[88px] place-content-center rounded-full bg-brand-surface">
          <Icon name="solar:cart-3-bold" class="size-[42px] text-primary" />
        </span>
        <h1 class="text-[22px] font-extrabold tracking-[-0.02em]">
          Корзина пуста
        </h1>
        <p class="max-w-[340px] text-[15px] text-muted-foreground">
          Добавьте товары в корзину, чтобы оформить заказ.
        </p>
        <NuxtLink
          to="/catalog"
          class="mt-1.5 inline-flex h-12 items-center rounded-xl bg-primary px-[26px] text-[15px] font-bold text-primary-foreground transition-colors hover:bg-brand-hover"
        >
          Перейти в каталог
        </NuxtLink>
      </div>

      <!-- ============ ОФОРМЛЕНИЕ ============ -->
      <div
        v-else
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_344px] lg:items-start lg:gap-6"
      >
        <div class="flex min-w-0 flex-col gap-7">
          <h1 class="text-[clamp(22px,3vw,28px)] font-extrabold tracking-[-0.025em]">
            Оформление заказа
          </h1>

          <!-- Контактные данные -->
          <section>
            <div class="mb-3 flex items-center justify-between gap-2.5">
              <h2 class="text-base font-extrabold">
                Контактные данные
              </h2>
              <button
                v-if="!isLoggedIn"
                type="button"
                class="inline-flex items-center gap-1.5 text-[13px] font-bold text-primary hover:underline"
                @click="modalStore.openLoginModal()"
              >
                <Icon name="lucide:log-in" class="size-[15px]" />
                Войти
              </button>
            </div>

            <div class="flex flex-col gap-2.5">
              <div class="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <input
                    id="name"
                    v-model="orderForm.name"
                    class="co-input"
                    :class="{ 'co-input--error': orderForm.name && !isValidName }"
                    autocomplete="name"
                    placeholder="Ваше имя"
                  >
                  <p
                    v-if="orderForm.name && !isValidName"
                    class="mt-1.5 text-xs text-destructive"
                  >
                    Минимум 2 символа
                  </p>
                </div>
                <div>
                  <input
                    id="phone"
                    v-model="orderForm.phone"
                    v-maska="phoneMaskOptions"
                    class="co-input"
                    :class="{
                      'co-input--error':
                        orderForm.phone && orderForm.phone.length > 4 && !isValidPhone,
                    }"
                    autocomplete="tel"
                    inputmode="tel"
                    placeholder="+7 (___) ___-__-__"
                    @focus="handlePhoneFocus"
                    @blur="handlePhoneBlur"
                  >
                  <p
                    v-if="orderForm.phone && orderForm.phone.length > 4 && phoneErrorMessage"
                    class="mt-1.5 text-xs text-destructive"
                  >
                    {{ phoneErrorMessage }}
                  </p>
                </div>
              </div>
              <!-- Email в макете нет, но без него create_guest_checkout падает,
                   а isFormValid не пропускает форму — поле обязательное. -->
              <div>
                <input
                  id="email"
                  v-model="orderForm.email"
                  type="email"
                  class="co-input"
                  :class="{ 'co-input--error': orderForm.email && !isValidEmail }"
                  autocomplete="email"
                  inputmode="email"
                  placeholder="Email для чека и статуса заказа"
                >
                <p
                  v-if="orderForm.email && !isValidEmail"
                  class="mt-1.5 text-xs text-destructive"
                >
                  Введите корректный email
                </p>
              </div>
            </div>

            <button
              v-if="!isLoggedIn"
              type="button"
              class="mt-3 flex w-full items-center gap-2.5 rounded-[14px] bg-bonus-surface px-3.5 py-3 text-left"
              @click="showGuestModal = true"
            >
              <Icon name="lucide:gift" class="size-[18px] shrink-0 text-bonus" />
              <span class="text-xs leading-[1.4]">
                Войдите, чтобы копить и списывать бонусы — до 10% кэшбэка с каждого заказа
              </span>
            </button>
          </section>

          <!-- Способ получения -->
          <section>
            <h2 class="mb-3.5 text-base font-extrabold">
              Способ получения
            </h2>
            <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                class="co-opt gap-[11px]"
                :class="isCourier ? 'co-opt--active text-primary' : 'text-foreground'"
                @click="cartStore.setDeliveryMethod('courier')"
              >
                <Icon name="lucide:truck" class="size-[22px] shrink-0" />
                <span class="flex flex-col items-start leading-[1.25]">
                  <span class="text-sm font-bold">Курьером</span>
                  <span class="text-xs text-muted-foreground">за 1–2 дня по Алматы</span>
                </span>
              </button>
              <button
                type="button"
                class="co-opt gap-[11px]"
                :class="!isCourier ? 'co-opt--active text-primary' : 'text-foreground'"
                @click="cartStore.setDeliveryMethod('pickup')"
              >
                <Icon name="lucide:store" class="size-[22px] shrink-0" />
                <span class="flex flex-col items-start leading-[1.25]">
                  <span class="text-sm font-bold">Самовывоз</span>
                  <span class="text-xs text-muted-foreground">бесплатно, сегодня</span>
                </span>
              </button>
            </div>
          </section>

          <!-- Пункт самовывоза -->
          <section v-if="!isCourier && pickupPoints.length > 0">
            <h2 class="mb-2.5 text-base font-extrabold">
              Пункт самовывоза
            </h2>
            <div class="flex flex-col gap-2.5">
              <button
                v-for="point in pickupPoints"
                :key="point.id"
                type="button"
                class="co-opt gap-[13px]"
                :class="{ 'co-opt--active': pickupPointId === point.id }"
                @click="pickupPointId = point.id"
              >
                <span
                  class="co-radio"
                  :class="{ 'co-radio--active': pickupPointId === point.id }"
                >
                  <span v-if="pickupPointId === point.id" class="size-2.5 rounded-full bg-white" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-[3px] text-left">
                  <span class="text-sm font-bold">{{ point.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ point.address }}</span>
                  <span v-if="point.working_hours" class="text-xs text-muted-foreground">
                    {{ point.working_hours }}
                  </span>
                  <span v-if="point.note" class="text-xs text-muted-foreground">
                    {{ point.note }}
                  </span>
                </span>
              </button>
            </div>
          </section>

          <!-- Адрес доставки -->
          <section v-if="isCourier" class="flex flex-col gap-5">
            <div>
              <h2 class="mb-2.5 text-base font-extrabold">
                Адрес доставки
              </h2>
              <div class="flex flex-col gap-2.5">
                <input
                  id="city"
                  v-model="deliveryAddress.city"
                  class="co-input"
                  placeholder="Город"
                >
                <div
                  class="co-input flex items-center gap-2.5"
                  :class="{ 'co-input--error': showAddrWarn }"
                >
                  <Icon name="lucide:map-pin" class="size-[18px] shrink-0 text-primary" />
                  <input
                    id="address"
                    v-model="deliveryAddress.line1"
                    class="min-w-0 flex-1 border-none bg-transparent outline-none"
                    placeholder="Улица, дом, квартира"
                  >
                </div>
                <input
                  id="comment"
                  v-model="orderForm.comment"
                  class="co-input"
                  placeholder="Комментарий к адресу — подъезд, этаж, домофон"
                >
              </div>
            </div>

            <!-- Дата -->
            <div>
              <h2 class="mb-2.5 text-base font-extrabold">
                Дата
              </h2>
              <div class="flex flex-wrap gap-2.5">
                <button
                  v-for="(date, index) in deliveryDates"
                  :key="date.iso"
                  type="button"
                  class="co-pill"
                  :class="{ 'co-pill--active': deliveryDateIndex === index }"
                  @click="deliveryDateIndex = index"
                >
                  {{ date.label }}
                </button>
              </div>
            </div>

            <!-- Время -->
            <div>
              <h2 class="mb-2.5 text-base font-extrabold">
                Время
              </h2>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                <button
                  v-for="(slot, index) in DELIVERY_SLOTS"
                  :key="slot"
                  type="button"
                  class="co-slot"
                  :class="{ 'co-slot--active': deliverySlotIndex === index }"
                  @click="deliverySlotIndex = index"
                >
                  <span class="inline-flex items-center gap-[5px] text-xs font-medium text-muted-foreground">
                    <Icon
                      name="lucide:clock"
                      class="size-[13px]"
                      :class="deliverySlotIndex === index ? 'text-primary' : 'text-muted-foreground'"
                    />
                    {{ DELIVERY_SLOT_DURATION }}
                  </span>
                  <span class="text-[15px] font-bold">{{ slot }}</span>
                  <span class="text-xs font-medium text-success">Бесплатно</span>
                </button>
              </div>
            </div>
          </section>

          <!-- Способ оплаты -->
          <section>
            <h2 class="mb-3.5 text-base font-extrabold">
              Способ оплаты
            </h2>
            <div class="flex flex-col gap-2.5">
              <button
                v-for="pm in PAYMENT_METHODS"
                :key="pm.key"
                type="button"
                class="co-opt gap-[13px]"
                :class="{ 'co-opt--active': orderForm.paymentMethod === pm.key }"
                @click="orderForm.paymentMethod = pm.key"
              >
                <span
                  class="grid size-[42px] shrink-0 place-content-center rounded-[11px]"
                  :class="pm.tint"
                >
                  <Icon :name="pm.icon" class="size-[22px]" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-[3px] text-left">
                  <span class="text-sm font-bold">{{ pm.name }}</span>
                  <span class="text-xs text-muted-foreground">{{ pm.desc }}</span>
                </span>
                <span
                  class="co-radio"
                  :class="{ 'co-radio--active': orderForm.paymentMethod === pm.key }"
                >
                  <span
                    v-if="orderForm.paymentMethod === pm.key"
                    class="size-2.5 rounded-full bg-white"
                  />
                </span>
              </button>
            </div>
          </section>

          <!-- Промокод и бонусы -->
          <section class="flex flex-col gap-[18px]">
            <div>
              <h2 class="mb-2.5 text-base font-extrabold">
                Промокод
              </h2>
              <div
                v-if="appliedPromoCode"
                class="flex items-center justify-between gap-3 rounded-[14px] bg-brand-surface px-3.5 py-3"
              >
                <span class="inline-flex items-center gap-2 text-sm">
                  <Icon name="lucide:badge-check" class="size-[15px] text-success" />
                  <b class="font-bold">{{ appliedPromoCode }}</b>
                  <span class="text-muted-foreground">— скидка {{ formatPrice(promoDiscount) }} ₸</span>
                </span>
                <button
                  type="button"
                  class="shrink-0 text-[13px] font-semibold text-muted-foreground hover:text-destructive"
                  @click="clearPromoCode"
                >
                  Отменить
                </button>
              </div>
              <div v-else class="flex gap-2.5">
                <input
                  v-model="promoCodeInput"
                  class="co-input flex-1 uppercase"
                  placeholder="Введите промокод"
                  @keyup.enter="applyPromoCode"
                >
                <button
                  type="button"
                  class="co-cta inline-flex h-12 shrink-0 items-center justify-center rounded-full px-[22px] text-sm font-extrabold text-white disabled:cursor-not-allowed"
                  :disabled="isPromoValidating || !promoCodeInput.trim()"
                  @click="applyPromoCode"
                >
                  {{ isPromoValidating ? 'Проверяем…' : 'Применить' }}
                </button>
              </div>
            </div>

            <div class="h-px bg-muted" />

            <!-- Списание бонусов -->
            <div v-if="isLoggedIn">
              <button
                type="button"
                class="flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="maxBonuses <= 0"
                @click="toggleBonuses"
              >
                <span class="co-check" :class="{ 'co-check--active': useBonuses }">
                  <Icon v-if="useBonuses" name="lucide:check" class="size-[15px] text-white" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span class="text-sm font-bold">Списать бонусы</span>
                  <span class="text-xs text-muted-foreground">
                    Доступно {{ formatPrice(bonusBalance) }} бонусов · 1 бонус = 1 ₸
                  </span>
                </span>
                <span class="text-[15px] font-extrabold text-bonus">
                  −{{ formatPrice(bonusesToSpend) }} ₸
                </span>
              </button>

              <!-- Частичное списание: макет предлагает всё-или-ничего,
                   но в проде поле суммы было — оставляем его под галочкой. -->
              <div v-if="useBonuses" class="mt-3 flex flex-wrap items-center gap-2.5">
                <input
                  id="bonuses"
                  v-model.number="bonusesInput"
                  type="number"
                  class="co-input min-w-[120px] flex-1"
                  min="0"
                  :max="maxBonuses"
                  placeholder="Сколько списать?"
                >
                <button
                  type="button"
                  class="h-12 shrink-0 rounded-full border px-4 text-[13px] font-semibold transition-colors hover:bg-muted"
                  @click="bonusesInput = maxBonuses"
                >
                  Максимум
                </button>
                <button
                  type="button"
                  class="co-cta inline-flex h-12 shrink-0 items-center justify-center rounded-full px-5 text-[13px] font-extrabold text-white"
                  @click="applyBonuses"
                >
                  Применить
                </button>
              </div>
              <p class="mt-2 text-[11px] text-muted-foreground">
                💡 Бонусы начисляются при подтверждении заказа и активируются через 14 дней
              </p>
            </div>

            <button
              v-else
              type="button"
              class="flex w-full items-center gap-3.5 rounded-[14px] border border-bonus-border bg-bonus-surface p-3.5 text-left"
              @click="showGuestModal = true"
            >
              <span class="grid size-10 shrink-0 place-content-center rounded-[11px] bg-white">
                <Icon name="lucide:lock" class="size-[19px] text-bonus" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="text-sm font-bold">Списание бонусов</span>
                <span class="text-xs text-muted-foreground">Войдите, чтобы копить и тратить бонусы</span>
              </span>
              <span class="shrink-0 text-[13px] font-bold text-primary">Войти</span>
            </button>
          </section>

          <!-- Согласие живёт в основной колонке, а не в сайдбаре: сайдбар
               по макету скрыт на мобильном, и вместе с ним пропала бы
               единственная возможность прочитать оферту и снять галочку.
               Не <label>: Checkbox из reka-ui рендерится как <button>, его
               label[for] всё равно не переключает, а ссылки внутри label
               ловят клик мимо цели. Кликабельна сама галочка. -->
          <div class="flex items-start gap-2.5">
            <Checkbox id="terms" v-model:checked="agreedToTerms" class="mt-0.5" />
            <span class="text-[11px] leading-[1.45] text-muted-foreground">
              Я согласен с условиями
              <a href="/terms" target="_blank" class="text-primary hover:underline">Публичной оферты</a>
              и
              <a href="/privacy-policy" target="_blank" class="text-primary hover:underline">политикой обработки персональных данных</a>
            </span>
          </div>
        </div>

        <!-- ============ САЙДБАР ============ -->
        <!-- В макете sideStyle на мобиле — display:none: сводку там заменяет
             липкая панель с итогом. cart.vue уже так, теперь и чекаут. -->
        <aside
          class="hidden rounded-[18px] bg-muted p-[22px] lg:sticky lg:top-[88px] lg:block"
        >
          <div class="mb-4 text-lg font-extrabold tracking-[-0.02em]">
            Ваш заказ
          </div>

          <div class="flex flex-col gap-[11px] text-sm font-medium">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Товары, {{ totalItems }} шт</span>
              <span>{{ formatPrice(subtotal) }} ₸</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Доставка</span>
              <span v-if="deliveryCost === 0" class="font-semibold text-success">Бесплатно</span>
              <span v-else>{{ formatPrice(deliveryCost) }} ₸</span>
            </div>
            <div
              v-if="promoDiscount > 0"
              class="flex items-center justify-between text-destructive"
            >
              <span>Промокод</span>
              <span>−{{ formatPrice(promoDiscount) }} ₸</span>
            </div>
            <div
              v-if="discountAmount > 0"
              class="flex items-center justify-between text-bonus"
            >
              <span>Списание бонусов</span>
              <span>−{{ formatPrice(discountAmount) }} ₸</span>
            </div>
            <div
              v-if="isCourier && subtotal < FREE_SHIPPING_THRESHOLD"
              class="text-xs text-muted-foreground"
            >
              Добавьте товаров на
              {{ formatPrice(FREE_SHIPPING_THRESHOLD - subtotal) }} ₸ для бесплатной доставки 🚚
            </div>
          </div>

          <Separator class="my-4" />

          <div class="mb-4 flex items-baseline justify-between">
            <span class="text-base font-bold">Итого</span>
            <b class="text-[22px] font-extrabold">{{ formatPrice(orderTotal) }} ₸</b>
          </div>

          <div
            v-if="isLoggedIn && bonusesToAward > 0"
            class="mb-4 flex items-center justify-between text-[13px] font-bold text-bonus"
          >
            <span class="inline-flex items-center gap-1.5">
              <Icon name="lucide:gift" class="size-3.5" />
              Начислим бонусов
            </span>
            <span>+{{ formatPrice(bonusesToAward) }}</span>
          </div>

          <button
            type="button"
            class="co-cta hidden h-[52px] w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-extrabold text-white disabled:cursor-not-allowed lg:flex"
            :disabled="isProcessing || !isFormValid"
            @click="placeOrder"
          >
            <template v-if="isProcessing">
              Оформляем заказ…
            </template>
            <template v-else>
              Оформить заказ
              <Icon name="lucide:arrow-right" class="size-[18px]" />
            </template>
          </button>

          <div
            v-if="showAddrWarn"
            class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] font-medium text-red-700"
          >
            Пожалуйста, укажите адрес доставки
          </div>

          <div
            class="mt-3.5 flex items-center justify-center gap-4 text-[11px] text-muted-foreground"
          >
            <span class="inline-flex items-center gap-1">
              <Icon name="lucide:lock" class="size-3" />
              Безопасная оплата
            </span>
            <span class="inline-flex items-center gap-1">
              <Icon name="lucide:package" class="size-3" />
              Возврат 14 дней
            </span>
          </div>
        </aside>
      </div>

      <!-- Компенсация высоты липкой панели на мобильных -->
      <div v-if="items.length > 0" class="h-[168px] lg:hidden" />
    </div>

    <!-- ============ МОБИЛЬНАЯ CTA-ПАНЕЛЬ ============ -->
    <ClientOnly>
      <div
        v-if="items.length > 0"
        class="co-mobile-cta fixed inset-x-3 z-40 lg:hidden"
        :class="isNavVisible ? 'co-mobile-cta--above-nav' : 'co-mobile-cta--at-bottom'"
      >
        <div
          v-if="showAddrWarn"
          class="mb-2.5 rounded-2xl border border-red-300/60 bg-red-50/85 px-3.5 py-2.5 text-xs font-medium text-red-700 backdrop-blur-lg"
        >
          Пожалуйста, укажите адрес доставки
        </div>
        <button
          type="button"
          class="co-mobile-cta__btn flex h-[60px] w-full items-center justify-between rounded-[22px] px-[22px] text-white disabled:cursor-not-allowed"
          :disabled="isProcessing || !isFormValid"
          @click="placeOrder"
        >
          <span class="text-base font-bold">
            {{ isProcessing ? 'Оформляем…' : 'Оформить заказ' }}
          </span>
          <span class="flex flex-col items-end leading-[1.12]">
            <b class="text-[17px] font-extrabold">{{ formatPrice(orderTotal) }} ₸</b>
            <span
              v-if="potentialBonuses > 0"
              class="inline-flex items-center gap-1 text-[11px] font-semibold opacity-90"
            >
              <Icon name="lucide:gift" class="size-[11px]" />
              +{{ formatPrice(potentialBonuses) }}
            </span>
          </span>
        </button>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
/* Стили этого файла лежат в @layer components намеренно.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял утилиту на том же
   элементе: так на этой странице умирали `hidden` и `lg:flex` у кнопки
   «Оформить заказ» и `gap-[11px]` у кнопок способа получения.

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок. */

@layer components {
  /* Поля ввода по макету: 48px, радиус 12, тонкая рамка. */
  .co-input {
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    background: var(--background);
    outline: none;
    transition: border-color 0.15s ease;
  }
  .co-input:focus-within,
  .co-input:focus {
    border-color: var(--primary);
  }
  .co-input--error {
    border-color: var(--destructive);
  }

  /* Строка-переключатель: «стекло» в покое, голубая заливка в выбранном
     состоянии. Значения литералами, а не через var(--color-blue-*):
     Tailwind 4 выкидывает переменную темы, если её не использует утилита. */
  /* gap не задаём здесь: пока он стоял, утилита gap-[11px] на кнопках способа
     получения не работала (scoped-стиль идёт вне @layer и бьёт утилиты), и
     вместо заложенных в макет 11px рисовались эти 13px. Расстояние теперь
     указано классом на каждой кнопке. */
  .co-opt {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 14px;
    border-radius: 18px;
    cursor: pointer;
    text-align: left;
    border: 1px solid var(--border);
    background: var(--background);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      0 1px 0 rgb(15 23 42 / 0.05);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease;
  }
  .co-opt--active {
    border-color: rgb(43 127 255 / 0.5);
    background: linear-gradient(150deg, rgb(219 234 254 / 0.95), rgb(191 219 254 / 0.55));
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.95),
      inset 0 -2px 6px rgb(6 53 138 / 0.09),
      0 6px 16px rgb(43 127 255 / 0.16);
  }

  /* Пилюля даты — pill() из макета. Активная в том же синем градиенте, что и
     кнопки-CTA, неактивная — белое «стекло», как .co-opt. */
  .co-pill {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 46px;
    padding: 0 20px;
    border-radius: 999px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      0 1px 0 rgb(15 23 42 / 0.05);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  .co-pill--active {
    font-weight: 800;
    color: #fff;
    border-color: rgb(255 255 255 / 0.45);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      inset 0 -2px 8px rgb(6 53 138 / 0.28),
      0 8px 20px rgb(43 127 255 / 0.3);
  }

  /* Карточка интервала — slotCard() из макета: та же «стеклянная» поверхность,
     что у .co-opt, но колонкой и с меньшими отступами. */
  .co-slot {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 13px 16px;
    border-radius: 18px;
    cursor: pointer;
    text-align: left;
    border: 1px solid var(--border);
    background: var(--background);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      0 1px 0 rgb(15 23 42 / 0.05);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease;
  }
  .co-slot--active {
    border-color: rgb(43 127 255 / 0.5);
    background: linear-gradient(150deg, rgb(219 234 254 / 0.95), rgb(191 219 254 / 0.55));
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.95),
      inset 0 -2px 6px rgb(6 53 138 / 0.09),
      0 6px 16px rgb(43 127 255 / 0.16);
  }

  .co-radio {
    flex: none;
    display: grid;
    place-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    border: 1.5px solid var(--rating-empty);
    background: var(--background);
    box-shadow: inset 0 -1px 3px rgb(15 23 42 / 0.06);
    transition: all 0.15s ease;
  }
  .co-radio--active {
    border: 1px solid rgb(255 255 255 / 0.5);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 4px 10px rgb(43 127 255 / 0.32);
  }

  .co-check {
    flex: none;
    display: grid;
    place-content: center;
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 2px solid var(--rating-empty);
    background: var(--background);
    transition: all 0.15s ease;
  }
  .co-check--active {
    border-color: var(--primary);
    background: var(--primary);
  }

  /* Только оформление, без раскладки. display/align здесь ломали бы утилиты:
     scoped-стиль идёт вне @layer, а утилиты Tailwind — внутри utilities, и
     беслойное правило бьёт слой независимо от специфичности. Из-за этого
     `hidden`/`lg:flex` на кнопке «Оформить заказ» были мертвы. Раскладку задаём
     классами на самой кнопке — как в .cart-cta на /cart. */
  .co-cta {
    border: 1px solid rgb(255 255 255 / 0.45);
    background: linear-gradient(150deg, rgb(77 148 255), rgb(23 101 235));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      inset 0 -2px 8px rgb(6 53 138 / 0.28),
      0 8px 20px rgb(43 127 255 / 0.3);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  .co-cta:hover:not(:disabled) {
    background: linear-gradient(150deg, rgb(96 163 255), rgb(29 112 246));
  }
  /* То же, что у мобильной панели: недоступность — отдельной заливкой.
     opacity поверх полупрозрачного градиента давала «стеклянную» кнопку. */
  .co-cta:disabled {
    background: linear-gradient(150deg, rgb(148 163 184), rgb(100 116 139));
    border-color: rgb(255 255 255 / 0.28);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.28),
      0 6px 16px rgb(15 23 42 / 0.16);
  }

  /* Липкая панель. Базовая позиция — у нижнего края (когда навбар скрыт),
     при видимом навбаре поднимаем на его высоту. */
  .co-mobile-cta {
    bottom: calc(16px + env(safe-area-inset-bottom));
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    will-change: transform;
  }
  .co-mobile-cta--above-nav {
    transform: translateY(-68px);
  }
  .co-mobile-cta--at-bottom {
    transform: translateY(0);
  }

  /* Заливка непрозрачная. Раньше был полупрозрачный градиент (0.92/0.9) плюс
     backdrop-filter, а сверху утилита disabled:opacity-60 — и в состоянии
     «форма не заполнена» кнопка светилась насквозь. Для гостя это состояние
     первое, что видно на мобильном: имя, телефон и email пустые, isFormValid
     false, кнопка disabled сразу при открытии страницы.
     Поэтому: сплошной градиент, а недоступность показываем отдельной заливкой,
     а не прозрачностью поверх прозрачного. */
  .co-mobile-cta__btn {
    border: 1px solid rgb(255 255 255 / 0.45);
    background: linear-gradient(180deg, rgb(59 138 255), rgb(29 108 240));
    box-shadow:
      0 14px 34px rgb(43 127 255 / 0.36),
      inset 0 1px 0 rgb(255 255 255 / 0.4);
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }
  .co-mobile-cta__btn:hover:not(:disabled) {
    background: linear-gradient(180deg, rgb(96 163 255), rgb(37 105 235));
  }
  .co-mobile-cta__btn:disabled {
    background: linear-gradient(180deg, rgb(148 163 184), rgb(100 116 139));
    border-color: rgb(255 255 255 / 0.28);
    box-shadow:
      0 10px 24px rgb(15 23 42 / 0.18),
      inset 0 1px 0 rgb(255 255 255 / 0.28);
  }
}
</style>
