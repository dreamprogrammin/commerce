import { describe, expect, it } from 'vitest'
import { ANALYTICS_OPT_OUT_KEY, analyticsDisabled, applyAnalyticsParam } from '../../utils/analyticsOptOut'

/**
 * Кого не считать в Google Analytics.
 *
 * 28 сентября 2026: за 30 дней 18 «посетителей» из 143 и 10 из 30
 * «добавлений в корзину» дали проверки агента на боевом сайте (эмуляция
 * Pixel 5, экран 393×851, у каждого ровно одна сессия), а все 17 «покупок»
 * за 90 дней — тестовые заказы. Настоящих покупателей за этим не видно.
 */

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

const broken = {
  getItem: () => { throw new Error('SecurityError') },
  setItem: () => { throw new Error('SecurityError') },
  removeItem: () => { throw new Error('SecurityError') },
}

describe('учёт посещений', () => {
  it('обычный посетитель считается, чужие параметры адреса ни на что не влияют', () => {
    const storage = memoryStorage()
    expect(applyAnalyticsParam('?utm_source=telegram', storage)).toBeNull()
    expect(analyticsDisabled({ webdriver: false, search: '?utm_source=telegram', storage })).toBe(false)
  })

  it('автоматический браузер не считается — проверки, боты, Playwright', () => {
    expect(analyticsDisabled({ webdriver: true, search: '', storage: memoryStorage() })).toBe(true)
  })

  it('?no_analytics=1 выключает учёт в этом браузере насовсем', () => {
    const storage = memoryStorage()
    expect(applyAnalyticsParam('?no_analytics=1', storage)).toBe('off')
    expect(storage.data.get(ANALYTICS_OPT_OUT_KEY)).toBe('1')
    // Следующий заход — уже без параметра
    expect(analyticsDisabled({ webdriver: false, search: '', storage })).toBe(true)
  })

  it('?no_analytics=0 возвращает учёт', () => {
    const storage = memoryStorage({ [ANALYTICS_OPT_OUT_KEY]: '1' })
    expect(applyAnalyticsParam('?no_analytics=0', storage)).toBe('on')
    expect(storage.data.has(ANALYTICS_OPT_OUT_KEY)).toBe(false)
    expect(analyticsDisabled({ webdriver: false, search: '', storage })).toBe(false)
  })

  it('решение не зависит от того, какой плагин прочитал адрес первым', () => {
    // Флаг ещё не записан, а параметр уже в адресе
    expect(analyticsDisabled({ webdriver: false, search: '?no_analytics=1', storage: memoryStorage() })).toBe(true)
    expect(analyticsDisabled({ webdriver: false, search: '?no_analytics=0', storage: memoryStorage({ [ANALYTICS_OPT_OUT_KEY]: '1' }) })).toBe(false)
  })

  it('localStorage недоступен — решаем по адресу и не падаем', () => {
    expect(applyAnalyticsParam('?no_analytics=1', broken)).toBeNull()
    expect(analyticsDisabled({ webdriver: false, search: '?no_analytics=1', storage: broken })).toBe(true)
    expect(analyticsDisabled({ webdriver: false, search: '', storage: broken })).toBe(false)
    expect(analyticsDisabled({ webdriver: false, search: '', storage: null })).toBe(false)
  })
})
