import type { WrittenOfferProduct } from '../../utils/aiWriter'
import { describe, expect, it } from 'vitest'
import { savedOfferTexts, toSavedOfferProduct } from '../../utils/aiWriter'

/*
 * Тексты ИИ сохраняются у товара поставщика (26.11.2026): после перезагрузки
 * форма «Новый товар» берёт сохранённое, а не просит ИИ снова.
 */

const answer: WrittenOfferProduct = {
  name: 'Машинка на радиоуправлении — внедорожник 1:16',
  description: '<p>Внедорожник для мальчиков от 6 лет.</p>',
  seoDescription: 'Радиоуправляемый внедорожник 1:16 в Алматы.',
  category: { id: 'cat-1', path: 'Мальчикам › Машинки' },
  brand: null,
  newBrand: 'Rastar',
  warnings: ['SEO-описание короче 120 знаков'],
  model: 'anthropic/claude-sonnet-5-5',
  photo: true,
  usage: { input: 900, cacheWrite: 0, cacheRead: 5200, output: 700, rate: { kzt: 512.3, date: '26.11.2026' } },
  budget: { since: '2026-11-01', budgetUsd: 10, spentUsd: 1.2, writer: { input: 1000, output: 700 } },
  savedAt: '2026-11-26T09:00:00.000Z',
}

describe('что сохраняется из ответа ИИ', () => {
  it('всё, кроме остатка бюджета и отметки о сохранении', () => {
    const saved = toSavedOfferProduct(answer, '2026-11-26T09:00:00.000Z')
    expect(saved).not.toHaveProperty('budget')
    expect(saved).not.toHaveProperty('savedAt')
    expect(saved.writtenAt).toBe('2026-11-26T09:00:00.000Z')
    expect(saved.usage).toEqual(answer.usage)
    expect(saved.newBrand).toBe('Rastar')
  })

  it('прочитанное из базы — то же, что сохранили', () => {
    const saved = toSavedOfferProduct(answer, '2026-11-26T09:00:00.000Z')
    const back = savedOfferTexts(JSON.parse(JSON.stringify({ 0: saved })))
    expect(back['0']).toEqual(saved)
  })

  it('ответ сервера старой сборки без расхода — без строки расхода', () => {
    const { usage: _usage, ...old } = answer
    const back = savedOfferTexts({ 2: toSavedOfferProduct(old, '2026-11-26T09:00:00.000Z') })
    expect(back['2']).toBeDefined()
    expect(back['2']).not.toHaveProperty('usage')
  })
})

describe('сохранённое из базы — только целые ответы', () => {
  const good = { name: 'Кукла', description: '<p>Кукла</p>', seoDescription: 'Кукла', model: 'm', writtenAt: '2026-11-26T09:00:00Z' }

  it('не объект, массив, null — пусто', () => {
    expect(savedOfferTexts(null)).toEqual({})
    expect(savedOfferTexts([good])).toEqual({})
    expect(savedOfferTexts('текст')).toEqual({})
  })

  it('битые записи пропускаются, целые остаются', () => {
    const texts = savedOfferTexts({
      0: good,
      1: { ...good, name: 5 },
      x: good,
      3: { ...good, writtenAt: 'вчера' },
      4: [good],
    })
    expect(Object.keys(texts)).toEqual(['0'])
  })

  it('раздел, бренд, предупреждения — только правильной формы', () => {
    const t = savedOfferTexts({ 0: { ...good, category: { id: 1 }, brand: { id: 'b', name: 'LEGO' }, warnings: ['a', 2], newBrand: '' } })['0']!
    expect(t.category).toBeNull()
    expect(t.brand).toEqual({ id: 'b', name: 'LEGO' })
    expect(t.warnings).toEqual(['a'])
    expect(t.newBrand).toBeNull()
    expect(t.photo).toBe(false)
  })

  it('расход без входа или выхода не показывается; без курса — курс null', () => {
    expect(savedOfferTexts({ 0: { ...good, usage: { output: 5 } } })['0']).not.toHaveProperty('usage')
    expect(savedOfferTexts({ 0: { ...good, usage: { input: 5, output: 6, rate: { kzt: 0, date: 'x' } } } })['0']!.usage)
      .toEqual({ input: 5, cacheWrite: 0, cacheRead: 0, output: 6, rate: null })
  })
})
