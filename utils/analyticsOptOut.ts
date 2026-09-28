/**
 * Кого не считать в Google Analytics.
 *
 * Зачем (28 сентября 2026). За 30 дней 18 «посетителей» из 143 и 10 из 30
 * «добавлений в корзину» дали проверки агента на боевом сайте — эмуляция
 * Pixel 5, экран 393×851, у каждого ровно одна сессия. Все 17 «покупок» за 90
 * дней — тестовые заказы, 9 из них с одного компьютера. Что делают настоящие
 * покупатели, за этим было не разглядеть.
 *
 * Не считаем:
 *  1. автоматические браузеры — Playwright, Puppeteer, Selenium и часть ботов
 *     сами сообщают `navigator.webdriver`. Так из статистики уходят все
 *     проверки сайта, и ни один скрипт проверки менять не нужно;
 *  2. устройства владельца — один раз открыть сайт с `?no_analytics=1`, и
 *     браузер запомнит это в localStorage. `?no_analytics=0` — вернуть учёт.
 */

type OptOutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Ключ в localStorage: учёт в этом браузере выключен владельцем. */
export const ANALYTICS_OPT_OUT_KEY = 'uhti:no-analytics'

function paramValue(search: string): string | null {
  return new URLSearchParams(search).get('no_analytics')
}

/**
 * Запомнить выбор из адреса. `'off'` / `'on'` — выбор записан, можно показать
 * подтверждение; `null` — параметра нет или записать не удалось.
 */
export function applyAnalyticsParam(search: string, storage: OptOutStorage | null): 'off' | 'on' | null {
  const param = paramValue(search)
  if ((param !== '1' && param !== '0') || !storage)
    return null
  try {
    if (param === '1')
      storage.setItem(ANALYTICS_OPT_OUT_KEY, '1')
    else
      storage.removeItem(ANALYTICS_OPT_OUT_KEY)
    return param === '1' ? 'off' : 'on'
  }
  catch {
    return null
  }
}

/**
 * Выключен ли учёт. Параметр адреса главнее записанного флага — так решение
 * одинаково, какой бы плагин ни прочитал адрес первым.
 */
export function analyticsDisabled(env: { webdriver: boolean, search: string, storage: OptOutStorage | null }): boolean {
  if (env.webdriver)
    return true
  const param = paramValue(env.search)
  if (param === '1')
    return true
  if (param === '0')
    return false
  try {
    return env.storage?.getItem(ANALYTICS_OPT_OUT_KEY) === '1'
  }
  catch {
    return false
  }
}

/** localStorage, если браузер его даёт: в приватном режиме доступ бросает. */
export function safeLocalStorage(): OptOutStorage | null {
  try {
    return window.localStorage
  }
  catch {
    return null
  }
}
