import { describe, expect, it } from 'vitest'
import { formatChildAge, pluralizeRu } from '@/utils/formatChildAge'

// Фиксированное «сегодня» — иначе тест начнёт разваливаться со временем
const NOW = new Date('2026-08-04T12:00:00Z')

describe('pluralizeRu', () => {
  const forms: [string, string, string] = ['год', 'года', 'лет']

  it('единственное число для 1, 21, 101', () => {
    expect(pluralizeRu(1, forms)).toBe('год')
    expect(pluralizeRu(21, forms)).toBe('год')
    expect(pluralizeRu(101, forms)).toBe('год')
  })

  it('форма 2-4 для 2, 3, 4, 22', () => {
    expect(pluralizeRu(2, forms)).toBe('года')
    expect(pluralizeRu(3, forms)).toBe('года')
    expect(pluralizeRu(4, forms)).toBe('года')
    expect(pluralizeRu(22, forms)).toBe('года')
  })

  it('множественное для 5-20 и 0', () => {
    expect(pluralizeRu(0, forms)).toBe('лет')
    expect(pluralizeRu(5, forms)).toBe('лет')
    expect(pluralizeRu(11, forms)).toBe('лет')
    expect(pluralizeRu(14, forms)).toBe('лет')
    expect(pluralizeRu(20, forms)).toBe('лет')
  })

  it('подростковый диапазон 11-14 не путается с 1-4', () => {
    expect(pluralizeRu(11, forms)).toBe('лет')
    expect(pluralizeRu(12, forms)).toBe('лет')
    expect(pluralizeRu(111, forms)).toBe('лет')
    expect(pluralizeRu(112, forms)).toBe('лет')
  })
})

describe('formatChildAge', () => {
  it('пустая дата — «Возраст не указан»', () => {
    expect(formatChildAge(null, NOW)).toBe('Возраст не указан')
    expect(formatChildAge(undefined, NOW)).toBe('Возраст не указан')
    expect(formatChildAge('', NOW)).toBe('Возраст не указан')
  })

  it('нераспознанная дата — «Возраст не указан»', () => {
    expect(formatChildAge('не дата', NOW)).toBe('Возраст не указан')
  })

  it('младше месяца', () => {
    expect(formatChildAge('2026-07-20', NOW)).toBe('Меньше месяца')
    expect(formatChildAge('2026-08-04', NOW)).toBe('Меньше месяца')
  })

  it('месяцы со склонением', () => {
    expect(formatChildAge('2026-07-01', NOW)).toBe('1 месяц')
    expect(formatChildAge('2026-05-01', NOW)).toBe('3 месяца')
    expect(formatChildAge('2025-09-01', NOW)).toBe('11 месяцев')
  })

  it('ровно год переводится в годы, а не в 12 месяцев', () => {
    expect(formatChildAge('2025-08-04', NOW)).toBe('1 год')
  })

  it('годы со склонением', () => {
    expect(formatChildAge('2023-08-04', NOW)).toBe('3 года')
    expect(formatChildAge('2021-08-04', NOW)).toBe('5 лет')
    expect(formatChildAge('2015-08-04', NOW)).toBe('11 лет')
  })

  it('день рождения в этом месяце ещё не наступил — месяц не засчитан', () => {
    // родился 20-го, сегодня 4-е: полных месяцев на один меньше
    expect(formatChildAge('2025-08-20', NOW)).toBe('11 месяцев')
    // тот же день месяца — год уже полный
    expect(formatChildAge('2025-08-04', NOW)).toBe('1 год')
  })

  it('дата в будущем не даёт отрицательный возраст', () => {
    expect(formatChildAge('2027-01-01', NOW)).toBe('Меньше месяца')
  })

  it('принимает и Date, и строку', () => {
    expect(formatChildAge(new Date('2023-08-04'), NOW)).toBe('3 года')
    expect(formatChildAge('2023-08-04', NOW)).toBe('3 года')
  })

  it('без второго аргумента считает от текущей даты и не падает', () => {
    expect(() => formatChildAge('2020-01-01')).not.toThrow()
    expect(formatChildAge('2020-01-01')).toMatch(/год|года|лет/)
  })
})
