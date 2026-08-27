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
 * beforeEach срабатывает всегда, поэтому и позицию запоминаем, и наверх
 * скроллим здесь. Заодно это ещё раньше: скролл случается до отрисовки новой
 * страницы, и промежуточного кадра «страница внизу» не бывает.
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

  router.beforeEach((to, from) => {
    const isPop = isPopNavigation
    isPopNavigation = false

    // Порядок несущий: сначала запомнить, потом скроллить. После scrollTo(0)
    // позиция уже потеряна, и «назад» вернул бы ноль — так и было в первой
    // версии этой правки.
    if (from.fullPath && from.fullPath !== to.fullPath)
      rememberScrollPosition(from.fullPath)

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

    window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
  })
})
