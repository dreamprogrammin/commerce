import { onMounted, onUnmounted } from 'vue'

/**
 * «Товар положили в корзину» — сигнал для нижней панели телефона.
 *
 * На телефоне о добавлении говорит сама панель (MobileBottomNav), по макету
 * `MobileNav.dc.html` — это вариант 1c холста «Тосты мобилка» в Claude
 * Design: товар долетает до её корзины, кольцо вокруг корзины показывает путь
 * до бесплатной доставки, и над ней на 2 с всплывает подсказка «+1 ещё N ₸ до
 * бесплатной». Тоста «Добавили в корзину» там нет: он стоял бы на том же месте
 * и говорил то же самое — на холсте два тоста стопкой занимали ~230px.
 *
 * Шлёт стор корзины: добавление (`addItem`) и рост количества
 * (`updateQuantity` — «+» в степперах, выбор из списка). Возврат удалённого
 * товара из тоста «Вернуть» добавлением не считается, сигнала нет.
 */
const CART_ADDED_EVENT = 'uhti:cart-added'

/** Сколько штук только что положили. */
export function notifyCartAdded(count: number) {
  if (import.meta.client && count > 0)
    window.dispatchEvent(new CustomEvent<number>(CART_ADDED_EVENT, { detail: count }))
}

export function useCartAdded(onAdded: (count: number) => void) {
  const listener = (event: Event) => onAdded((event as CustomEvent<number>).detail)
  onMounted(() => window.addEventListener(CART_ADDED_EVENT, listener))
  onUnmounted(() => window.removeEventListener(CART_ADDED_EVENT, listener))
}

/**
 * Нижняя панель на экране — значит, о добавлении скажет она, а тост не нужен.
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
