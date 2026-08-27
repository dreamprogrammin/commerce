/**
 * Свои сохранённые позиции скролла для перехода «назад».
 *
 * Зачем свои, если vue-router и так отдаёт `savedPosition`: он вычисляет
 * позицию слишком поздно — когда старая страница уже размонтирована и скролл
 * сброшен. Замерено на стенде (390px, CPU ×4), каталог с y=1800 → товар →
 * назад:
 *
 *   перед кликом   y=1800   history.state.scroll = false
 *   при возврате   savedPosition = {left: 0, top: 0}
 *
 * То есть в историю уезжает ноль, и «назад» всегда открывает страницу сверху.
 * Мы записываем позицию в router.beforeEach — там DOM ещё цел и скролл настоящий.
 *
 * Ключ — адрес страницы. Номер записи в истории (`history.state.position`) был
 * бы точнее, но не годится: при возврате браузер меняет `history.state` ДО того,
 * как отработает beforeEach, и запись целевой страницы затиралась бы нулём —
 * ровно той позицией, от которой мы уходим. Проверено замером: с ключом по
 * номеру возврат по-прежнему давал y=0.
 *
 * Плата за адрес: если один и тот же адрес встречается в истории дважды с
 * разным скроллом, обе записи делят одну ячейку и возврат отдаст последнюю. На
 * практике это то же самое место, куда человек и хочет вернуться.
 */
export interface ScrollPosition {
  left: number
  top: number
}

/** Больше и не нужно: это глубина истории, по которой реально ходят назад. */
const LIMIT = 30

const positions = new Map<string, ScrollPosition>()

export function rememberScrollPosition(fullPath: string) {
  positions.delete(fullPath)
  positions.set(fullPath, { left: window.scrollX, top: window.scrollY })
  while (positions.size > LIMIT)
    positions.delete(positions.keys().next().value as string)
}

export function recallScrollPosition(fullPath: string): ScrollPosition | null {
  return positions.get(fullPath) ?? null
}
