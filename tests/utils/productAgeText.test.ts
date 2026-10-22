import { describe, expect, it } from 'vitest'
import { ageMentions, ageTextConflicts } from '@/utils/productAgeText'

/*
 * Разбор — тот же, что у стража check-product-age-text.mjs: форма админки
 * предупреждает о расхождении до сохранения, страж ловит уже опубликованное.
 */
describe('ageMentions', () => {
  const months = (text: string) => ageMentions(text).map(m => m.months)

  it('числом: «от 3 лет», «с 6 месяцев», «от 1,5 до 3 лет», «3–6 лет»', () => {
    expect(months('Кукла для девочек от 3 лет')).toEqual([36])
    expect(months('Погремушка с 6 месяцев')).toEqual([6])
    expect(months('Самокат от 1,5 до 3 лет')).toEqual([18])
    expect(months('Набор 3–6 лет')).toEqual([36])
    expect(months('Погремушка на присоске Sky Wheel ABL002-2 — 11×7×18 см, от 3 месяцев')).toEqual([3])
  })

  it('словами: «от трёх лет», «от года», «с полугода», «с рождения»', () => {
    expect(months('Конструктор от трёх лет')).toEqual([36])
    expect(months('Каталка от года')).toEqual([12])
    expect(months('Пирамидка с полугода')).toEqual([6])
    expect(months('Мобиль с рождения')).toEqual([0])
  })

  it('«3+» — возраст, а «35+ сюрпризов» и «6+ игровых элементов» — счёт', () => {
    expect(months('Конструктор LEGO 3+')).toEqual([36])
    expect(months('Шар с 35+ сюрпризов')).toEqual([])
    expect(months('Набор: 6+ игровых элементов')).toEqual([])
  })

  it('теги описания не мешают', () => {
    expect(months('<p>Рекомендуемый возраст — <b>от 3 месяцев</b>.</p>')).toEqual([3])
  })
})

describe('ageTextConflicts', () => {
  it('погремушка 21.10: «от 3 месяцев» в тексте при возрасте «с рождения» — оба места', () => {
    expect(ageTextConflicts({
      name: 'Погремушка на присоске Sky Wheel ABL002-2 — 11×7×18 см, от 3 месяцев',
      description: '<p>Рекомендуемый возраст — от 3 месяцев.</p>',
      minAgeMonths: 0,
    })).toEqual([
      { where: 'название', src: 'от 3 месяцев' },
      { where: 'описание', src: 'от 3 месяцев' },
    ])
  })

  it('совпадает с полем — расхождений нет', () => {
    expect(ageTextConflicts({ name: 'Кукла от 3 лет', description: 'Для детей 3+', minAgeMonths: 36 })).toEqual([])
  })

  it('поле пустое — расходится любое упоминание', () => {
    expect(ageTextConflicts({ name: 'Кукла от 3 лет', minAgeMonths: null })).toEqual([{ where: 'название', src: 'от 3 лет' }])
  })

  it('одна фраза дважды в описании — одно предупреждение', () => {
    expect(ageTextConflicts({ description: 'От 3 лет. Подходит детям от 3 лет.', minAgeMonths: 12 })).toHaveLength(1)
  })
})
