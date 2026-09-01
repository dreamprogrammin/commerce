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
 * Сброс делается по хуку `page:finish` — он приходит, когда новая страница
 * ГОТОВА, и срабатывает на всех переходах, включая каталог → карточка товара
 * (где молчат и afterEach, и scrollBehavior). Проверено отладкой всех точек:
 *
 *   главная → /catalog          beforeEach, afterEach, scrollBehavior, page:*
 *   /catalog/all → товар        beforeEach, page:* — и всё
 *
 * Наблюдателя за адресом роутера здесь было мало. Он срабатывает, как только
 * переход разрешён, а это может быть сильно раньше отрисовки: замер
 * 1 сентября на переходе главная → /brands показал смену адреса на 56 мс и
 * появление страницы только на 1612 мс. Полторы секунды человек смотрел на
 * прежнюю страницу, уже сброшенную наверх.
 *
 * `behavior: 'instant'` обязателен: у `html` в глобальных стилях стоит
 * `scroll-behavior: smooth`, и без него сброс превращается в анимацию через всю
 * страницу — на замере она занимала 1.1 секунды.
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  /*
   * Признак «идёт переход» для заглушки. Поднимается здесь, а не по хуку
   * `page:start`: beforeEach срабатывает на любом переходе и раньше всех.
   */
  const navigating = useNavigating()

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
    navigating.value = true
  })

  const nuxtApp = useNuxtApp()
  nuxtApp.hook('page:finish', () => {
    navigating.value = false
    if (!pendingReset)
      return
    pendingReset = false
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
  })

  // Переход мог оборваться (гейт авторизации, ошибка) — снимаем признак,
  // иначе заглушка осталась бы висеть.
  router.afterEach(() => {
    if (!navigating.value)
      return
    setTimeout(() => {
      navigating.value = false
    }, 5000)
  })
})
