import { onMounted, onUnmounted } from 'vue'

/**
 * Корзину изменил покупатель — сигнал для нижней панели телефона.
 *
 * На телефоне о добавлении и удалении говорит сама панель (MobileBottomNav),
 * тостов там нет. Добавление — по макету `MobileNav.dc.html` (вариант 1c
 * холста «Тосты мобилка» в Claude Design): товар долетает до корзины панели,
 * кольцо вокруг неё показывает путь до бесплатной доставки, над ней на 2 с
 * всплывает «+1 ещё N ₸ до бесплатной». Удаление — так же, но красным «−1»
 * и с «Вернуть», если позиция ушла целиком (владелец 25.11.2026: тост при
 * удалении убрать, сделать как при добавлении).
 *
 * Шлёт стор корзины: `addItem`, `updateQuantity` (рост и убыль количества),
 * `removeItem` — этот с возвратом позиции на место. И страница корзины —
 * «Очистить». Возврат из «Вернуть» (`restoreItem`) и очистка после заказа
 * сигнала не шлют: это не действие покупателя над корзиной.
 */
const CART_CHANGE_EVENT = 'uhti:cart-change'

export interface CartChange {
  /** Сколько штук положили (больше нуля) или убрали (меньше нуля). */
  delta: number
  /** Вернуть позицию на место — есть, когда она ушла из корзины целиком. */
  undo?: () => void
}

export function notifyCartChange(delta: number, undo?: () => void) {
  if (import.meta.client && delta !== 0)
    window.dispatchEvent(new CustomEvent<CartChange>(CART_CHANGE_EVENT, { detail: { delta, undo } }))
}

export function useCartChange(onChange: (change: CartChange) => void) {
  const listener = (event: Event) => onChange((event as CustomEvent<CartChange>).detail)
  onMounted(() => window.addEventListener(CART_CHANGE_EVENT, listener))
  onUnmounted(() => window.removeEventListener(CART_CHANGE_EVENT, listener))
}

/**
 * Нижняя панель на экране — значит, о добавлении и удалении скажет она, а
 * тосты не нужны.
 *
 * Панели нет в админке (её не монтирует `app.vue`) и с 1024px (`lg:hidden`).
 * Решается по разметке, а не по ширине окна: так тост пропадает ровно там,
 * где есть кому показать подсказку.
 */
export function isBottomNavShown() {
  if (!import.meta.client)
    return false
  const nav = document.querySelector<HTMLElement>('[data-cart-dock]')
  return !!nav && getComputedStyle(nav).display !== 'none'
}
