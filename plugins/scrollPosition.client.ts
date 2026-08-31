import { rememberScrollPosition } from '@/utils/scrollPositions'

/**
 * Скролл при переходах между страницами.
 *
 * Почему это здесь, а не в app/router.options.ts: для части переходов
 * `scrollBehavior` не вызывается вовсе. Замерено на стенде (390px, CPU ×4),
 * каталог с y=1800 → карточка товара, видимая на экране:
 *
 *   beforeEach /catalog/all -> …-ot-6-mesyacev  y=1800   ← сработал
 *   afterEach                                            ← НЕ сработал
 *   scrollBehavior                                       ← НЕ вызывался
 *   через 7 секунд                              y=1800   ← так и осталось
 *
 * При этом адрес в браузере и currentRoute роутера — оба уже на товаре,
 * перезагрузки документа нет (одна navigation-запись). То есть переход
 * происходит, а хвост его обработки до нас не доходит. Именно поэтому владелец
 * видел, что товар открывается на том же месте, где он листал каталог.
 *
 * beforeEach срабатывает всегда, поэтому позицию запоминаем здесь.
 *
 * А вот скроллить в beforeEach оказалось нельзя, и это была моя ошибка.
 * Владелец описал её так: «прокрутил вниз, нажал переход — страница прыгает
 * наверх, и только потом грузится та, куда идёшь». Так и есть: beforeEach
 * отрабатывает ДО отрисовки новой страницы, то есть прокрутка сбрасывается на
 * старой, у человека на глазах. Замер (390px, CPU ×4, уход с y=1800):
 *
 *   199 мс   ещё главная, прокрутка уже 0   ← рывок виден
 *   734 мс   всё ещё главная
 *  2242 мс   каталог наконец появился
 *
 * Сброс перенесён на наблюдатель за адресом роутера. Он срабатывает после
 * подтверждения перехода — и, в отличие от afterEach и scrollBehavior,
 * срабатывает НА ВСЕХ переходах, включая каталог → карточка товара. Проверено
 * отладкой всех трёх точек:
 *
 *   главная → /catalog          beforeEach, afterEach, watch, scrollBehavior
 *   /catalog/all → товар        beforeEach, watch — и всё
 *
 * `behavior: 'instant'` обязателен: у `html` в глобальных стилях стоит
 * `scroll-behavior: smooth`, и без него сброс превращается в анимацию через всю
 * страницу — на замере она занимала 1.1 секунды.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()

  // Переход назад/вперёд позицию не сбрасывает — её восстанавливает роутер.
  let isPopNavigation = false
  window.addEventListener('popstate', () => {
    isPopNavigation = true
  })

  /** Нужен ли сброс наверх, когда переход подтвердится. */
  let pendingReset = false

  router.beforeEach((to, from) => {
    const isPop = isPopNavigation
    isPopNavigation = false

    // Позицию запоминаем именно здесь: beforeEach срабатывает всегда, а
    // прокрутка ещё не тронута.
    if (from.fullPath && from.fullPath !== to.fullPath)
      rememberScrollPosition(from.fullPath)

    pendingReset = false

    // Переход назад/вперёд позицию не сбрасывает — её восстанавливает роутер.
    if (isPop)
      return

    // Тот же путь — поменялись только фильтры или якорь, позицию не трогаем.
    if (to.path.replace(/\/$/, '') === from.path.replace(/\/$/, ''))
      return

    if (to.hash)
      return

    const allowsScrollToTop = typeof to.meta.scrollToTop === 'function'
      ? to.meta.scrollToTop(to, from)
      : to.meta.scrollToTop
    if (allowsScrollToTop === false)
      return

    pendingReset = true
  })

  watch(() => router.currentRoute.value.fullPath, () => {
    if (!pendingReset)
      return
    pendingReset = false
    // nextTick — чтобы новая страница успела попасть в документ: сброс должен
    // совпасть со сменой картинки, а не опередить её.
    void nextTick(() => {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    })
  })
})
