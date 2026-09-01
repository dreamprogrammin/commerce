import type { RouterConfig } from '@nuxt/schema'
import { useNuxtApp } from '#app/nuxt'
import { recallScrollPosition } from '@/utils/scrollPositions'

/**
 * Своё поведение скролла при переходах.
 *
 * Штатная реализация Nuxt делает две вещи, которые вместе давали баг, описанный
 * владельцем как «при входе в товар или категорию скролл начинается снизу и
 * резко идёт наверх»:
 *
 *  1. Она возвращает промис и резолвит его только после `page:loading:end` и
 *     промиса транзишена. К этому моменту новая страница уже отрисована — на
 *     СТАРОМ смещении. Замер на стенде (390px, CPU ×4), переход из каталога,
 *     прокрученного до y=2500, в категорию:
 *
 *       363 мс  y=2538  /catalog/boys/mashinki   ← открылась на середине
 *       644 мс  y=3908                           ← и уехала ещё ниже
 *
 *  2. Позицию она возвращает без `behavior`, а в глобальных стилях у `html`
 *     стоит `scroll-behavior: smooth`. Поэтому сброс наверх не мгновенный, а
 *     анимированный — в том же замере он занял 1.1 секунды:
 *
 *       731…1772 мс  3899 → 3841 → 3757 → 3514 → 3382 → 3212 → 1115 → 51 → 0
 *
 * Здесь остались только два случая: возврат назад и якоря. Обычный переход
 * наверх скроллит plugins/scrollPosition.client.ts по хуку `page:finish` —
 * когда новая страница готова.
 *
 * Почему не здесь. `scrollBehavior` вызывается, как только переход разрешён,
 * а до отрисовки может пройти ещё секунда. Сброс в этот момент виден на
 * СТАРОЙ странице: она подскакивает наверх и висит так, пока не появится
 * новая. Плюс для части переходов (каталог → карточка товара) роутер
 * `scrollBehavior` не вызывает вовсе — там молчит и `afterEach`.
 *
 * Ожидание отрисовки сохранено там, где оно действительно нужно: при переходе
 * назад/вперёд (иначе браузер обрежет восстановленную позицию по ещё короткой
 * странице) и при переходе на якорь чужой страницы (элемента ещё нет в DOM).
 *
 * Остальная семантика повторяет штатную: тот же путь — позицию не трогаем,
 * `to.meta.scrollToTop === false` уважаем.
 */

/** Отступ якоря: scroll-margin самого элемента плюс scroll-padding страницы. */
function hashOffset(selector: string): number {
  try {
    const el = document.querySelector(selector)
    if (el) {
      return (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0)
        + (Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
    }
  }
  catch {}
  return 0
}

/**
 * Ждём, пока документ дорастёт до нужной позиции.
 *
 * Список товаров каталога дорисовывается после `page:loading:end`, и без
 * ожидания браузер обрезал бы восстановленную позицию по ещё короткой странице.
 * Ограничение по времени обязательно: страница может и не дорасти (товар из
 * выдачи убрали), и тогда просто прокрутимся куда получится.
 */
function waitForHeight(top: number, timeout = 1200): Promise<void> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeout
    const check = () => {
      const enough = document.documentElement.scrollHeight >= top + window.innerHeight
      if (enough || performance.now() > deadline) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    const nuxtApp = useNuxtApp()

    // Тот же путь: поменялись только hash или query.
    if (to.path.replace(/\/$/, '') === from.path.replace(/\/$/, '')) {
      if (from.hash && !to.hash)
        return { left: 0, top: 0 }
      if (to.hash)
        return { el: to.hash, top: hashOffset(to.hash), behavior: 'smooth' }
      return false
    }

    const allowsScrollToTop = typeof to.meta.scrollToTop === 'function'
      ? to.meta.scrollToTop(to, from)
      : to.meta.scrollToTop
    if (allowsScrollToTop === false)
      return false

    // Ждать отрисовки нужно только этим двум случаям.
    if (savedPosition || to.hash) {
      /*
       * savedPosition от vue-router приезжает нулевым: он вычисляет позицию
       * уже после размонтирования старой страницы. Свою мы записали в
       * beforeEach, когда скролл был настоящий (см. utils/scrollPositions.ts).
       */
      const target = savedPosition
        ? recallScrollPosition(to.fullPath) ?? savedPosition
        : null

      return new Promise((resolve) => {
        nuxtApp.hooks.hookOnce('page:loading:end', async () => {
          if (target)
            await waitForHeight(target.top)
          requestAnimationFrame(() => {
            resolve(
              target
              ?? { el: to.hash, top: hashOffset(to.hash), behavior: 'smooth' },
            )
          })
        })
      })
    }

    /*
     * Обычный переход наверх НЕ скроллим здесь.
     *
     * `scrollBehavior` вызывается, как только переход разрешён, а это бывает
     * сильно раньше отрисовки: замер 1 сентября на главная → /brands показал
     * смену адреса на 56 мс и появление страницы только на 1612 мс. Сброс
     * отсюда означал бы полторы секунды прежней страницы, уже подскочившей
     * наверх, — ровно тот артефакт, на который жаловался владелец.
     *
     * Сбросом владеет plugins/scrollPosition.client.ts по хуку `page:finish`:
     * он приходит, когда новая страница готова, и работает на всех переходах.
     */
    return false
  },
}
