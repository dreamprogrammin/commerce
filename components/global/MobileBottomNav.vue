<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { revealBottomNav, useBottomNavReveal } from '@/composables/useBottomNavReveal'
import { useCartChange } from '@/composables/useCartChange'
import { FREE_SHIPPING_THRESHOLD } from '@/constants'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import { formatPrice } from '@/utils/formatPrice'

interface NavItem {
  path: string
  icon: string
  /**
   * Залитая версия для активного пункта.
   *
   * Контурная иконка на белой линзе читалась слабо — владелец так и сказал,
   * «не видно». Приём тот же, что в iOS: неактивные пункты контурные,
   * выбранный — залитый. Все залитые взяты из одного набора (mdi), иначе
   * пропорции у выбранного пункта прыгали бы от вкладки к вкладке.
   */
  iconActive: string
  label: string
  badge?: 'cart' | 'wish'
  requiresAuth?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'gravity-ui:house', iconActive: 'mdi:home', label: 'Главная' },
  { path: '/catalog', icon: 'lucide:layout-grid', iconActive: 'mdi:view-grid', label: 'Каталог' },
  { path: '/profile/wishlist', icon: 'gravity-ui:heart', iconActive: 'mdi:heart', label: 'Избранное', badge: 'wish', requiresAuth: true },
  { path: '/profile', icon: 'gravity-ui:person', iconActive: 'mdi:account', label: 'Профиль', requiresAuth: true },
  { path: '/cart', icon: 'gravity-ui:shopping-bag', iconActive: 'mdi:shopping', label: 'Корзина', badge: 'cart' },
]

const route = useRoute()
const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const isPageLoading = usePageLoading()

const { isLoggedIn } = storeToRefs(authStore)
const { totalItems: cartCount, subtotal, isDeliveryByWeight } = storeToRefs(cartStore)
const wishCount = computed(() => wishlistStore.wishlistProductIds.length)

function isActivePath(path: string) {
  // '/profile' must match exactly — otherwise it also lights up on '/profile/wishlist'
  if (path === '/' || path === '/profile')
    return route.path === path
  return route.path.startsWith(path)
}

/*
 * Путь, на который только что нажали.
 *
 * Подсветка считается от адреса роутера, а он обновляется поздно: замер
 * 31 августа (390px, CPU ×4) — от нажатия до первого признака перехода
 * 812 мс полной тишины, и полоска загрузки появлялась одновременно с новой
 * страницей. Человек в это время не понимает, засчиталось ли нажатие.
 *
 * Поэтому подсветка едет сразу по нажатию, а адрес роутера её потом
 * подтверждает. Если переход не случился (отменён гейтом авторизации,
 * упал), признак снимается по таймеру — иначе подсветка соврала бы навсегда.
 */
const pendingPath = ref<string | null>(null)
let pendingTimer: ReturnType<typeof setTimeout> | null = null

function clearPending() {
  pendingPath.value = null
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = null
  }
}

watch(() => route.path, clearPending)
onUnmounted(clearPending)

const activeIndex = computed(() => {
  const byTap = pendingPath.value
    ? NAV_ITEMS.findIndex(item => item.path === pendingPath.value)
    : -1
  if (byTap !== -1)
    return byTap
  return NAV_ITEMS.findIndex(item => isActivePath(item.path))
})

/*
 * Линзу можно водить пальцем.
 *
 * Это ВОЗМОЖНОСТЬ, а не обязанность: обычное нажатие по пункту работает
 * ровно как раньше, через NuxtLink. Перетаскивание — второй способ для тех,
 * кто его нащупает.
 *
 * Устройство. `pressed` — палец на панели: линза и иконка под ней немного
 * подрастают. `dragAt` — дробная позиция линзы под пальцем, чтобы она
 * следовала непрерывно, а не прыгала по пунктам. Переход случается на
 * отпускании и только если палец реально проехал: короткое касание должно
 * остаться обычным нажатием, иначе мы сломали бы привычное поведение.
 */
const DRAG_THRESHOLD = 12
const pressed = ref(false)
const dragAt = ref<number | null>(null)
const barEl = ref<HTMLElement | null>(null)
let startX = 0
let moved = false
let pointerId: number | null = null

/** Ближайший пункт под пальцем. */
const dragIndex = computed(() =>
  dragAt.value === null ? -1 : Math.round(dragAt.value),
)

/** Куда смотрит линза: под пальцем, если ведут, иначе на активном пункте. */
const lensAt = computed(() =>
  dragAt.value !== null ? dragAt.value : Math.max(activeIndex.value, 0),
)

const lensStyle = computed(() => ({
  transform: `translateY(-50%) translateX(${lensAt.value * 100}%)`,
  transition: dragAt.value !== null ? 'none' : undefined,
}))

/** Доля позиции внутри панели, 0…(кол-во пунктов − 1). */
function positionFromEvent(e: PointerEvent): number | null {
  const el = barEl.value
  if (!el)
    return null
  const r = el.getBoundingClientRect()
  const шаг = r.width / NAV_ITEMS.length
  const raw = (e.clientX - r.left) / шаг - 0.5
  return Math.min(Math.max(raw, 0), NAV_ITEMS.length - 1)
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0)
    return
  pointerId = e.pointerId
  startX = e.clientX
  moved = false
  pressed.value = true
}

function onPointerMove(e: PointerEvent) {
  if (!pressed.value || e.pointerId !== pointerId)
    return
  if (!moved && Math.abs(e.clientX - startX) < DRAG_THRESHOLD)
    return
  if (!moved) {
    /*
     * Захват берём только когда движение НАЧАЛОСЬ, а не на нажатии. С
     * захватом на нажатии ссылка не получала клика вовсе — обычное нажатие
     * переставало работать. А без захвата вообще перетаскивание обрывалось
     * на первом же переходе с пункта на пункт.
     */
    try {
      barEl.value?.setPointerCapture(e.pointerId)
    }
    catch {}
  }
  moved = true
  dragAt.value = positionFromEvent(e)
}

function endDrag(e: PointerEvent) {
  if (e.pointerId !== pointerId)
    return
  try {
    barEl.value?.releasePointerCapture(e.pointerId)
  }
  catch {}
  const цель = moved ? dragIndex.value : -1
  pressed.value = false
  dragAt.value = null
  pointerId = null
  if (цель < 0)
    return
  const item = NAV_ITEMS[цель]
  if (!item || isActivePath(item.path))
    return
  if (item.requiresAuth && !isLoggedIn.value) {
    modalStore.openLoginModal()
    return
  }
  pendingPath.value = item.path
  isPageLoading.value = true
  navigateTo(item.path)
}

function cancelDrag() {
  pressed.value = false
  dragAt.value = null
  pointerId = null
  moved = false
}

const displayItems = computed(() => NAV_ITEMS.map((item, index) => {
  const count = item.badge === 'cart' ? cartCount.value : item.badge === 'wish' ? wishCount.value : 0
  return {
    ...item,
    isActive: index === activeIndex.value,
    // Под пальцем подрастает та иконка, над которой линза сейчас стоит.
    isPressed: pressed.value && index === (dragIndex.value >= 0 ? dragIndex.value : activeIndex.value),
    badgeText: count > 99 ? '99+' : String(count),
    showBadge: !!item.badge && count > 0,
  }
}))

// NuxtLink's own navigation handler runs before a sibling `@click` listener,
// so a plain `event.preventDefault()` there is too late to stop it. Using the
// `custom` slot hands us the `navigate` trigger directly, so the gate always
// runs first.
function handleItemClick(event: MouseEvent, item: NavItem, navigate: (e?: MouseEvent) => void) {
  // Палец проехал — переход уже случился на отпускании, клик тут лишний.
  if (moved) {
    event.preventDefault()
    return
  }

  if (item.requiresAuth && !isLoggedIn.value) {
    event.preventDefault()
    modalStore.openLoginModal()
    return
  }

  // Нажатие по текущей странице — не переход, отклик не нужен.
  if (!isActivePath(item.path)) {
    clearPending()
    pendingPath.value = item.path
    isPageLoading.value = true
    // Страховка: если переход почему-то не состоялся, отклик надо снять.
    pendingTimer = setTimeout(() => {
      clearPending()
      isPageLoading.value = false
    }, 5000)
  }

  navigate(event)
}

// Scroll-aware visibility: hide once scrolled past 280px while moving down,
// reveal again on any upward scroll or once back near the top.
// Ещё панель выезжает, когда товар летит в корзину (useCartFly): на телефоне
// товар летит в её корзину, даже если прокрутка её спрятала. Липкие панели
// страниц едут вместе с ней и ловят то же событие (useBottomNavReveal).
const isHidden = ref(false)
let lastScrollY = 0
let ticking = false

function applyScroll() {
  ticking = false
  const y = window.scrollY
  const dy = y - lastScrollY
  if (dy > 6 && y > 280)
    isHidden.value = true
  else if (dy < -6 || y < 120)
    isHidden.value = false
  lastScrollY = y
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))
useBottomNavReveal(() => {
  isHidden.value = false
})

/*
 * Путь до бесплатной доставки: кольцо вокруг корзины и подсказка над ней.
 *
 * Макет MobileNav.dc.html — вариант 1c холста «Тосты мобилка» в Claude
 * Design. Тоста «Добавили в корзину» здесь нет (useToasts молчит, пока панель
 * на экране): товар долетает до корзины панели, и над ней на 2,2 с всплывает
 * «+1 ещё N ₸ до бесплатной». Кольцо видно всё время, пока корзина не пуста.
 *
 * Удаление — так же, но красным «−1», с коротким «проседанием» корзины и, если
 * позиция ушла целиком, с «Вернуть» (тост удаления на телефоне тоже убран;
 * владелец 25.11.2026: «товары, которые убираются, — убрать тост и сделать
 * такой, как при добавлении, только чтобы сигнализировал правильно»).
 *
 * Порог — про курьера по Алматы. Посылке в другой город цену называют после
 * взвешивания, порога у неё нет: тогда ни кольца, ни счёта до бесплатной —
 * так же, как на странице корзины.
 *
 * Отличия от макета. Линза и залитая активная иконка — прежние: макет нарисован
 * с панели до 1 сентября, а их ввели позже, по просьбе владельца. «+1» — сколько
 * положили на самом деле: быстрые «+» складываются, выбор «5 шт» из списка
 * даёт «+4». У порога — «Доставка по Алматы бесплатная», как на странице
 * корзины: «бесплатная» без города обещала бы лишнее посылке в другой город.
 * Кольцо наполняется плавно (@property ниже) — в макете переход объявлен, но
 * градиент без этого не анимируется и прыгает.
 */
const freeLeft = computed(() => Math.max(FREE_SHIPPING_THRESHOLD - subtotal.value, 0))
const showRing = computed(() =>
  cartCount.value > 0 && subtotal.value > 0 && !isDeliveryByWeight.value,
)
const ringStyle = computed(() => ({
  '--mbn-ring': `${Math.min((subtotal.value / FREE_SHIPPING_THRESHOLD) * 100, 100)}%`,
}))

const TIP_MS = 2200
/** С «Вернуть» подсказка живёт дольше, как жил тост удаления: успеть нажать. */
const TIP_UNDO_MS = 4000
const tipShown = ref(false)
/** Положили или убрали — от этого знак, его цвет и текст. */
const tipKind = ref<'add' | 'remove'>('add')
/** Сколько штук, пока подсказка на экране: быстрые «+» и «−» складываются. */
const tipCount = ref(0)
/** Вернуть убранную позицию. Остаётся и на угасание — кнопка тогда выключена. */
const tipUndo = shallowRef<(() => void) | null>(null)
/** Текст для экранного диктора: сама подсказка от него спрятана, она обрывочна. */
const tipAnnouncement = ref('')
let tipTimer: ReturnType<typeof setTimeout> | null = null
/** Штук в корзине после последнего сигнала — чтобы узнать убыль без сигнала. */
let signalledCount = -1

const tipText = computed(() => {
  if (tipKind.value === 'remove' && cartCount.value === 0)
    return 'корзина пуста'
  if (isDeliveryByWeight.value)
    return tipKind.value === 'add' ? 'в корзине' : 'из корзины'
  return freeLeft.value > 0
    ? `ещё ${formatPrice(freeLeft.value)}\u00A0₸ до бесплатной`
    : 'Доставка по Алматы бесплатная'
})
// «+N» — пока до порога не дошли: рядом с «бесплатная» счёт уже ни к чему.
// «−N» — всегда: он и есть сигнал, что убрали, а не положили.
const tipSign = computed(() => {
  if (!tipCount.value)
    return ''
  if (tipKind.value === 'remove')
    return `−${tipCount.value}`
  return freeLeft.value > 0 || isDeliveryByWeight.value ? `+${tipCount.value}` : ''
})

function hideTip() {
  tipShown.value = false
  tipAnnouncement.value = ''
  if (tipTimer) {
    clearTimeout(tipTimer)
    tipTimer = null
  }
}

function announce(kind: 'add' | 'remove') {
  const done = kind === 'add' ? 'Добавили в корзину' : 'Убрали из корзины'
  if (kind === 'remove' && cartCount.value === 0)
    return `${done}. Корзина пуста`
  if (isDeliveryByWeight.value)
    return done
  return freeLeft.value > 0
    ? `${done}. До бесплатной доставки по Алматы ещё ${formatPrice(freeLeft.value)} тенге`
    : `${done}. Доставка по Алматы бесплатная`
}

/**
 * Убрали — корзина на миг «проседает». Зеркально пульсу при прилёте товара
 * (useCartFly: 1 → 1,24 → 0,96 → 1): там она подрастает, здесь сжимается.
 */
function dipCart() {
  const cart = barEl.value?.querySelector<HTMLElement>('[data-cart-target]')
  if (!cart || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    return
  cart.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(0.8)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'cubic-bezier(0.34, 1.4, 0.5, 1)' },
  )
}

useCartChange(({ delta, undo }) => {
  const kind = delta > 0 ? 'add' : 'remove'
  const count = Math.abs(delta)
  // Складываются только простые шаги: у «−3, Вернуть» возврат один, и
  // сложенный счёт обещал бы вернуть больше, чем вернёт.
  const adds = tipShown.value && tipKind.value === kind && !undo && !tipUndo.value
  tipCount.value = adds ? tipCount.value + count : count
  tipKind.value = kind
  tipUndo.value = undo ?? null
  tipShown.value = true
  signalledCount = cartCount.value
  if (tipTimer)
    clearTimeout(tipTimer)
  tipTimer = setTimeout(hideTip, undo ? TIP_UNDO_MS : TIP_MS)
  tipAnnouncement.value = announce(kind)
  if (kind === 'remove')
    dipCart()

  // Подсказка живёт в панели, а прокрутка могла её спрятать. Липкие панели
  // страниц едут следом — у них тот же показ (useBottomNavReveal).
  revealBottomNav()
})

function undoRemoval() {
  const undo = tipUndo.value
  hideTip()
  undo?.()
}

// Корзина убыла не по сигналу — очистка после заказа, сверка с сервером:
// подсказка о прошлом действии уже неверна и уходит.
watch(cartCount, (count, previous) => {
  if (count < previous && count !== signalledCount)
    hideTip()
})
onUnmounted(hideTip)
</script>

<template>
  <nav
    ref="barEl"
    class="flex items-center lg:hidden z-50 mbn-bar"
    :class="isHidden ? 'mbn-bar--hidden' : ''"
    data-cart-dock
    aria-label="Основная навигация"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="endDrag"
    @pointercancel="cancelDrag"
  >
    <span v-if="activeIndex >= 0" class="mbn-lens" :class="{ 'mbn-lens--pressed': pressed }" :style="lensStyle">
      <span class="mbn-lens__pill" />
    </span>

    <NuxtLink
      v-for="item in displayItems"
      :key="item.path"
      v-slot="{ href, navigate }"
      :to="item.path"
      custom
    >
      <a
        :href="href"
        class="mbn-item"
        draggable="false"
        :aria-label="item.label"
        :aria-current="item.isActive ? 'page' : undefined"
        @dragstart.prevent
        @click="handleItemClick($event, item, navigate)"
      >
        <span
          class="mbn-icon-wrap"
          :data-cart-target="item.badge === 'cart' ? '' : undefined"
        >
          <span v-if="item.badge === 'cart' && showRing" class="mbn-ring" :style="ringStyle" />
          <Icon
            :name="item.isActive || item.isPressed ? item.iconActive : item.icon"
            mode="svg"
            class="mbn-icon transition-[transform,color] duration-300 ease-out"
            :class="[
              item.isActive ? 'text-primary' : 'text-muted-foreground',
              item.isPressed ? 'scale-[1.42]' : item.isActive ? 'scale-[1.26]' : 'scale-100',
            ]"
          />
          <span v-if="item.showBadge" class="mbn-badge">{{ item.badgeText }}</span>
        </span>
      </a>
    </NuxtLink>

    <!-- Подсказка над корзиной: положили или убрали. Стрелка — ::after. -->
    <span
      class="mbn-tip"
      :class="{ 'mbn-tip--shown': tipShown, 'mbn-tip--remove': tipKind === 'remove' }"
    >
      <span v-if="tipSign" class="mbn-tip__sign" aria-hidden="true">{{ tipSign }}</span>
      <span class="mbn-tip__text" aria-hidden="true">{{ tipText }}</span>
      <!-- pointerdown не пускаем к панели: иначе нажатие подхватит линза. -->
      <button
        v-if="tipUndo"
        type="button"
        class="mbn-tip__undo"
        aria-label="Вернуть товар в корзину"
        :disabled="!tipShown"
        :aria-hidden="!tipShown"
        @pointerdown.stop
        @click.stop="undoRemoval"
      >
        Вернуть
      </button>
    </span>
    <span class="sr-only" role="status">{{ tipAnnouncement }}</span>
  </nav>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .mbn-bar {
    /* Горизонтальные жесты забираем себе, вертикальную прокрутку страницы
       оставляем браузеру: иначе с панели нельзя было бы листать страницу. */
    touch-action: pan-y;
    /* Без этого протягивание по панели выделяет подписи и рвёт жест. */
    user-select: none;
    -webkit-user-select: none;
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: calc(12px + env(safe-area-inset-bottom));
    height: 50px;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.18));
    -webkit-backdrop-filter: blur(24px) saturate(1.9);
    backdrop-filter: blur(24px) saturate(1.9);
    border: 1px solid rgba(255, 255, 255, 0.65);
    border-radius: 22px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 0 -1px 1px rgba(15, 23, 42, 0.05),
      0 12px 32px rgba(15, 23, 42, 0.18);
    transition:
      opacity 0.28s ease,
      transform 0.28s cubic-bezier(0.32, 0.72, 0.33, 1);
  }

  .mbn-bar--hidden {
    opacity: 0;
    pointer-events: none;
    transform: translateY(140%);
  }

  .mbn-lens {
    position: absolute;
    top: 50%;
    left: 0;
    width: 20%;
    height: 100%;
    display: grid;
    place-content: center;
    transition: transform 0.46s cubic-bezier(0.34, 1.12, 0.4, 1);
    pointer-events: none;
    z-index: 0;
  }

  /* Под пальцем линза подрастает — как нажатие в iOS. Масштаб на самой
     линзе, а не на панели: панель не должна дрожать. */
  .mbn-lens--pressed .mbn-lens__pill {
    transform: scale(1.14);
    box-shadow:
      inset 0 2px 1px rgba(255, 255, 255, 1),
      inset 0 -3px 5px rgba(15, 23, 42, 0.09),
      0 10px 22px rgba(15, 23, 42, 0.26);
  }

  .mbn-lens__pill {
    transition:
      transform 0.18s cubic-bezier(0.34, 1.3, 0.5, 1),
      box-shadow 0.18s ease;
    width: 44px;
    height: 44px;
    /*
     * Скруглённый квадрат, а не круг. Радиус — треть стороны: меньше читается
     * как «квадрат со скруглением», больше снова скатывается в круг. Та же
     * пропорция, что у иконок приложений в iOS.
     */
    border-radius: 15px;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.5));
    border: 1px solid rgba(255, 255, 255, 0.95);
    box-shadow:
      inset 0 2px 1px rgba(255, 255, 255, 1),
      inset 0 -3px 5px rgba(15, 23, 42, 0.09),
      0 7px 18px rgba(15, 23, 42, 0.22);
  }

  .mbn-item {
    flex: 1;
    min-width: 0;
    position: relative;
    z-index: 1;
    height: 100%;
    display: grid;
    place-content: center;
  }

  .mbn-icon-wrap {
    position: relative;
    display: grid;
    place-content: center;
    width: 40px;
    height: 40px;
  }

  .mbn-icon {
    width: 22px;
    height: 22px;
  }

  /* Кольцо пути до бесплатной доставки: 34px вокруг иконки, толщина 3px. */
  .mbn-ring {
    position: absolute;
    left: 3px;
    top: 3px;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: conic-gradient(var(--primary) 0 var(--mbn-ring), rgb(43 127 255 / 0.2) var(--mbn-ring) 100%);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
    transition: --mbn-ring 0.4s ease;
    pointer-events: none;
  }

  /*
   * Подсказка над корзиной. Правый край — на 20px правее центра корзины
   * (центр пятого пункта — 90% ширины панели), стрелка 10px стоит в 15px от
   * края: её середина ровно над центром корзины. Растёт подсказка влево.
   */
  .mbn-tip {
    position: absolute;
    right: calc(10% - 20px);
    bottom: calc(100% + 10px);
    height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    background: #0f172a;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 13px var(--font-sans);
    white-space: nowrap;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.25);
    pointer-events: none;
    /* Потолок ширины — до 8px от левого края экрана. Без него подсказка
       шире места не сжимается: строки без переносов дают ей минимальную
       ширину, а она у абсолютного блока сильнее доступной, — и на 320px
       «−1 Доставка по Алматы бесплатная Вернуть» (316px) уезжала за край на
       22px. Панель начинается в 17px от края (16 + рамка), правый край
       подсказки — в 90% + 20px от начала панели: 17 + 90% + 20 − 8 = 90% + 29px. */
    max-width: calc(90% + 29px);
    opacity: 0;
    transform: translateY(6px) scale(0.94);
    transform-origin: calc(100% - 20px) 100%;
    transition:
      opacity 0.2s ease,
      transform 0.3s cubic-bezier(0.34, 1.3, 0.5, 1);
  }

  .mbn-tip--shown {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  .mbn-tip::after {
    content: '';
    position: absolute;
    right: 15px;
    bottom: -4px;
    width: 10px;
    height: 10px;
    background: #0f172a;
    transform: rotate(45deg);
    border-radius: 2px;
  }

  .mbn-tip__sign {
    flex: none;
    color: #8ec5ff;
  }

  /* Убрали — знак красный: с первого взгляда не спутать с «+1». Бледный
     red-300 на тёмном читался розовым, red-400 — уже красный (контраст 6:1). */
  .mbn-tip--remove .mbn-tip__sign {
    color: #f87171;
  }

  /* Упёрлась в потолок ширины (320px) — уступает текст: обрезается
     многоточием, а «−1» и «Вернуть» остаются целыми. */
  .mbn-tip__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Во всю высоту подсказки — в неё легче попасть пальцем. */
  .mbn-tip__undo {
    flex: none;
    height: 32px;
    margin-right: -6px;
    padding: 0 6px;
    border: 0;
    background: none;
    color: #8ec5ff;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  /* Подсказка сквозная для пальца, кроме «Вернуть» — и та, лишь пока видна. */
  .mbn-tip--shown .mbn-tip__undo {
    pointer-events: auto;
  }

  /*
   * Над навигацией стоит липкая панель страницы — покупка на карточке товара,
   * «Оформить заказ» в корзине. Подсказка на обычном месте легла бы на её
   * нижние 32px, прямо на «+» степпера. Встаёт над панелью, стрелка — на неё.
   *
   * 92 = 82 + 10. Верх обеих панелей — в 144px от низа экрана: покупка —
   * bottom 72 + высота 72 (9 + 52 + 9 + рамка), «Оформить» — bottom 16 +
   * подъём 68 + высота 60. Верх навигации — в 62 (12 + 50), разница 82, и
   * ещё 10 зазора, как у подсказки над самой навигацией. Числа держатся
   * стилями этих страниц; разъедутся — поймает check-mobile-nav.mjs.
   */
  :global(body:has(.pdp-buybar:not(.pdp-buybar--down)) .mbn-tip),
  :global(body:has(.cart-mobile-cta--above-nav) .mbn-tip) {
    bottom: calc(100% + 92px);
  }

  .mbn-badge {
    position: absolute;
    top: -3px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #ef4444;
    color: #fff;
    font: 700 10px var(--font-sans);
    display: grid;
    place-content: center;
    border: 2px solid #fff;
  }
}

/* Без регистрации градиент кольца не анимируется — доля прыгала бы. Вне слоя:
   @property от каскада не зависит. */
@property --mbn-ring {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}
</style>
