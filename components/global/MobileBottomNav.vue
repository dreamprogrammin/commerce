<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

interface NavItem {
  path: string
  icon: string
  label: string
  badge?: 'cart' | 'wish'
  requiresAuth?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'gravity-ui:house', label: 'Главная' },
  { path: '/catalog', icon: 'lucide:layout-grid', label: 'Каталог' },
  { path: '/profile/wishlist', icon: 'gravity-ui:heart', label: 'Избранное', badge: 'wish', requiresAuth: true },
  { path: '/profile', icon: 'gravity-ui:person', label: 'Профиль', requiresAuth: true },
  { path: '/cart', icon: 'gravity-ui:shopping-bag', label: 'Корзина', badge: 'cart' },
]

const route = useRoute()
const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const isPageLoading = usePageLoading()

const { isLoggedIn } = storeToRefs(authStore)
const { totalItems: cartCount } = storeToRefs(cartStore)
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
</script>

<template>
  <nav
    ref="barEl"
    class="flex items-center lg:hidden z-50 mbn-bar"
    :class="isHidden ? 'mbn-bar--hidden' : ''"
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
        <span class="mbn-icon-wrap">
          <Icon
            :name="item.icon"
            mode="svg"
            class="mbn-icon transition-[transform,color] duration-300 ease-out"
            :class="[
              item.isActive ? 'text-primary' : 'text-muted-foreground',
              item.isPressed ? 'scale-[1.34]' : item.isActive ? 'scale-[1.18]' : 'scale-100',
            ]"
          />
          <span v-if="item.showBadge" class="mbn-badge">{{ item.badgeText }}</span>
        </span>
      </a>
    </NuxtLink>
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
    width: 42px;
    height: 42px;
    border-radius: 999px;
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
</style>
