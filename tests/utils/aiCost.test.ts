import { describe, expect, it } from 'vitest'
import { aiBudgetLines, aiRequestUsd, aiUsageLines, formatAiKzt, formatAiUsd } from '~/utils/aiCost'

/*
 * Строка «Расход» в карточке «Тексты от ИИ» (24 ноября 2026): токены
 * запроса, цена по ценам Anthropic с кешем и пересчёт в тенге по курсу
 * Нацбанка.
 */

const SONNET = 'anthropic/claude-sonnet-5-5'
const NBSP = '\u00A0'
const million = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }

describe('цена запроса', () => {
  it('у Sonnet 5.5 миллион токенов: вход $2, запись в кеш $2,50, чтение $0,10, выход $10', () => {
    expect(aiRequestUsd(SONNET, { ...million, input: 1e6 })).toBeCloseTo(2, 10)
    expect(aiRequestUsd(SONNET, { ...million, cacheWrite: 1e6 })).toBeCloseTo(2.5, 10)
    expect(aiRequestUsd(SONNET, { ...million, cacheRead: 1e6 })).toBeCloseTo(0.1, 10)
    expect(aiRequestUsd(SONNET, { ...million, output: 1e6 })).toBeCloseTo(10, 10)
  })

  it('чтение из кеша: Opus 5.5 — 0,05 цены входа, Haiku 5.5 — 0,1', () => {
    expect(aiRequestUsd('anthropic/claude-opus-5-5', { ...million, cacheRead: 1e6 })).toBeCloseTo(0.2, 10)
    expect(aiRequestUsd('anthropic/claude-haiku-5-5', { ...million, cacheRead: 1e6 })).toBeCloseTo(0.01, 10)
  })

  it('запрос стража: 1000 мимо кеша, 4000 в кеш, 500 из кеша, 600 ответа — $0,01805', () => {
    expect(aiRequestUsd(SONNET, { input: 1000, cacheWrite: 4000, cacheRead: 500, output: 600 })).toBeCloseTo(0.01805, 10)
  })

  it('модели нет в таблице цен — null, а не ноль', () => {
    expect(aiRequestUsd('openai/gpt-5', { ...million, input: 1000 })).toBeNull()
  })
})

describe('деньги словами', () => {
  it('тенге: до 10 — с десятыми, дальше целыми с разрядами; знак не отрывается', () => {
    expect(formatAiKzt(8.1225)).toBe(`8,1${NBSP}₸`)
    expect(formatAiKzt(0.04)).toBe(`0,0${NBSP}₸`)
    expect(formatAiKzt(92.6)).toBe(`93${NBSP}₸`)
    expect(formatAiKzt(1234.5)).toBe(`1${NBSP}235${NBSP}₸`)
  })

  it('доллары: меньше доллара — три знака, дальше два', () => {
    expect(formatAiUsd(0.01805)).toBe('$0,018')
    expect(formatAiUsd(1.5)).toBe('$1,50')
  })
})

describe('строки карточки', () => {
  const rate = { kzt: 450, date: '23.11.2026' }

  it('токены запроса — вместе с кешем; цена в тенге и долларах; курс с датой', () => {
    expect(aiUsageLines(SONNET, { input: 1000, cacheWrite: 4000, cacheRead: 500, output: 600, rate })).toEqual({
      spent: `Расход: 6${NBSP}100 токенов (запрос 5${NBSP}500, ответ 600) ≈ 8,1${NBSP}₸ · $0,018`,
      rate: `Курс Нацбанка на 23.11.2026: 450,00${NBSP}₸ за $`,
    })
  })

  it('курс не свежий — так и сказано', () => {
    expect(aiUsageLines(SONNET, { ...million, output: 1000, rate: { kzt: 455.12, date: '24.11.2026', stale: true } }).rate)
      .toBe(`Курс Нацбанка на 24.11.2026: 455,12${NBSP}₸ за $ — свежий курс не получен`)
  })

  it('курса нет — только доллары; цены модели нет — только токены', () => {
    expect(aiUsageLines(SONNET, { ...million, input: 21, rate: null })).toEqual({ spent: 'Расход: 21 токен (запрос 21, ответ 0) ≈ $0,000', rate: null })
    expect(aiUsageLines('openai/gpt-5', { ...million, input: 2, rate })).toEqual({ spent: 'Расход: 2 токена (запрос 2, ответ 0) — цены этой модели в таблице нет', rate: null })
  })
})

describe('бюджет в карточке', () => {
  // Запрос стража: 4 500 токенов начала запроса в кеше. После перерыва — $0,01925, подряд — $0,00845
  const usage = { input: 1000, cacheWrite: 4000, cacheRead: 500, output: 600, rate: { kzt: 450, date: '23.11.2026' } }
  const prod = { budgetUsd: 3.34, since: '2026-11-05', spentUsd: 0.714, writer: { input: 115260, output: 6299 } }
  const WRITER = `Описания (Claude Sonnet 5.5) с 5 ноября: 121${NBSP}559 токенов`

  it('токены описаний с начала бюджета — без денег; остаток в тенге; число описаний — по цене после перерыва, подряд — отдельно', () => {
    expect(aiBudgetLines(SONNET, prod, usage)).toEqual({
      writer: WRITER,
      left: `Бюджет ИИ: осталось ≈ 1${NBSP}182${NBSP}₸ ($2,63 из $3,34) — примерно на 136 таких описаний, подряд — на 310`,
      cache: `Описание после перерыва больше 5 минут ≈ 8,7${NBSP}₸, а подряд ≈ 3,8${NBSP}₸ — ИИ ещё помнит правила, разделы и бренды сайта`,
    })
  })

  it('число не прыгает: у этого описания кеш записан или прочитан — строки те же', () => {
    const lines = aiBudgetLines(SONNET, prod, usage)
    expect(aiBudgetLines(SONNET, prod, { ...usage, cacheWrite: 4500, cacheRead: 0 })).toEqual(lines)
    expect(aiBudgetLines(SONNET, prod, { ...usage, cacheWrite: 0, cacheRead: 4500 })).toEqual(lines)
  })

  it('без курса — в долларах', () => {
    expect(aiBudgetLines(SONNET, prod, { ...usage, rate: null })).toEqual({
      writer: WRITER,
      left: 'Бюджет ИИ: осталось ≈ $2,63 из $3,34 — примерно на 136 таких описаний, подряд — на 310',
      cache: 'Описание после перерыва больше 5 минут ≈ $0,019, а подряд ≈ $0,008 — ИИ ещё помнит правила, разделы и бренды сайта',
    })
  })

  it('без кеша — одно число и без строки про «подряд»; описание по числу: одно, два, много', () => {
    // $0,008 за описание
    const lines = (spentUsd: number) => aiBudgetLines(SONNET, { ...prod, budgetUsd: 0.05, spentUsd }, { ...usage, cacheWrite: 0, cacheRead: 0 })
    expect(lines(0.04)).toEqual({ writer: WRITER, left: `Бюджет ИИ: осталось ≈ 4,5${NBSP}₸ ($0,010 из $0,050) — примерно на 1 такое описание`, cache: null })
    expect(lines(0.03).left).toMatch(/— примерно на 2 таких описания$/)
    expect(lines(0).left).toMatch(/— примерно на 6 таких описаний$/)
    expect(lines(0.045).left).toMatch(/— меньше, чем на одно такое описание$/)
  })

  it('после перерыва не хватит и на одно — так и сказано; подряд — сколько выйдет', () => {
    expect(aiBudgetLines(SONNET, { ...prod, budgetUsd: 0.05, spentUsd: 0.035 }, usage).left).toMatch(/— меньше, чем на одно такое описание, подряд — на 1$/)
  })

  it('бюджет не задан — за 30 дней и подсказка, где задать', () => {
    const lines = aiBudgetLines(SONNET, { ...prod, budgetUsd: null, since: '2026-10-26' }, usage)
    expect(lines.writer).toBe(`Описания (Claude Sonnet 5.5) за 30 дней: 121${NBSP}559 токенов`)
    expect(lines.left).toBe('Бюджет ИИ не задан — задайте сумму на счёте Anthropic в «Умном закупе», карточка «Бюджет ИИ»: здесь будет видно, на сколько описаний хватит')
    expect(lines.cache).toBeNull()
  })

  it('бюджет исчерпан; цены модели нет — так и сказано', () => {
    expect(aiBudgetLines(SONNET, { ...prod, spentUsd: 3.4 }, usage).left).toBe('Бюджет ИИ по журналу исчерпан ($3,40 из $3,34) — пополните счёт Anthropic и задайте сумму заново в «Умном закупе»')
    expect(aiBudgetLines(SONNET, { ...prod, spentUsd: null }, usage).left).toBe('Остаток бюджета не посчитать: цены одной из моделей нет в таблице')
  })
})
