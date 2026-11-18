import { describe, expect, it } from 'vitest'
import { filterByDemand } from '@/utils/offerDemand'
import { narrowLevel, narrowLevelBounds, normalizeQueries, normalizeQuery, offerNarrow, parseQueriesReply } from '@/utils/offerQueries'

/** Точный спрос у товаров поставщиков (18.11.2026): «работает слишком широко, типа по запросу «куклы»». */

describe('normalizeQuery — фраза, которую примут Google Ads и база', () => {
  it('строчными, знаки и дефис — пробелом, ё — е', () => {
    expect(normalizeQuery('  Кукла «Барби» — Ветеринар! ')).toBe('кукла барби ветеринар')
    expect(normalizeQuery('Человек-паук фигурка')).toBe('человек паук фигурка')
    expect(normalizeQuery('ёлка игрушечная')).toBe('елка игрушечная')
    expect(normalizeQuery('hot wheels трек')).toBe('hot wheels трек')
  })
  it('одно слово, длиннее 6 слов или 60 знаков, чужие буквы, не строка — мимо', () => {
    expect(normalizeQuery('кукла')).toBeNull()
    expect(normalizeQuery('раз два три четыре пять шесть семь')).toBeNull()
    expect(normalizeQuery(`кукла ${'а'.repeat(60)}`)).toBeNull()
    expect(normalizeQuery('玩具 кукла')).toBeNull()
    expect(normalizeQuery(5)).toBeNull()
  })
  it('список товара: без повторов и не больше трёх', () => {
    expect(normalizeQueries(['Кукла Барби', 'кукла барби', 'кукла', 'кукла с питомцем', 'кукла доктор', 'кукла пупс'])).toEqual(['кукла барби', 'кукла с питомцем', 'кукла доктор'])
    expect(normalizeQueries('не список')).toEqual([])
  })
})

describe('parseQueriesReply', () => {
  it('по номерам из запроса; чужие и повторные — мимо; ```json``` — тоже', () => {
    const raw = '```json\n{"items":[{"id":"0.0","queries":["Кукла Барби ветеринар","кукла"]},{"id":"9.9","queries":["лишнее слово"]},{"id":"0.0","queries":["повтор фразы"]},{"id":"1.0","queries":[]}]}\n```'
    expect([...parseQueriesReply(raw, ['0.0', '1.0'])]).toEqual([['0.0', ['кукла барби ветеринар']], ['1.0', []]])
  })
  it('не JSON или без items — ошибка', () => {
    expect(() => parseQueriesReply('Не могу', ['0.0'])).toThrow()
    expect(() => parseQueriesReply('{"x":1}', ['0.0'])).toThrow('items')
  })
})

describe('offerNarrow — точный спрос по самой частой фразе', () => {
  const volumes = { 'кукла барби ветеринар': 140, 'кукла с питомцем': null, 'машинка на пульте': 1600 }
  it('самая частая из проверенных; непроверенные — в конце', () => {
    const n = offerNarrow([['кукла с питомцем', 'кукла барби ветеринар', 'кукла барби доктор']], volumes)
    expect(n).toMatchObject({ phrase: 'кукла барби ветеринар', volume: 140, checked: true })
    expect(n!.phrases.map(p => p.phrase)).toEqual(['кукла барби ветеринар', 'кукла с питомцем', 'кукла барби доктор'])
    expect(n!.phrases[2]).toEqual({ phrase: 'кукла барби доктор', volume: null, checked: false })
  })
  it('проверены, но ищут редко — 0; не проверены — checked false; фраз нет — null', () => {
    expect(offerNarrow([['кукла с питомцем']], volumes)).toMatchObject({ phrase: null, volume: 0, checked: true })
    expect(offerNarrow([['кукла новая серия']], volumes)).toMatchObject({ checked: false })
    expect(offerNarrow(null, volumes)).toBeNull()
    expect(offerNarrow([[]], volumes)).toBeNull()
  })
  it('товар поста отдельно', () => {
    const q = [['кукла барби ветеринар'], ['машинка на пульте']]
    expect(offerNarrow(q, volumes)!.volume).toBe(1600)
    expect(offerNarrow(q, volumes, 0)!.volume).toBe(140)
  })
})

describe('уровень и «Высокий спрос» по точным фразам', () => {
  const volumes = { 'а б': 10, 'в г': 50, 'д е': 300, 'ж з': 2000, 'и к': null }
  it('трети фраз с цифрами; меньше трёх — делить не на что', () => {
    expect(narrowLevelBounds(volumes)).toEqual({ mid: 50, high: 300 })
    expect(narrowLevelBounds({ 'а б': 10, 'в г': 50 })).toBeNull()
    const b = narrowLevelBounds(volumes)
    expect(narrowLevel(offerNarrow([['ж з']], volumes), b)).toBe('high')
    expect(narrowLevel(offerNarrow([['в г']], volumes), b)).toBe('mid')
    expect(narrowLevel(offerNarrow([['а б']], volumes), b)).toBe('low')
    expect(narrowLevel(offerNarrow([['и к']], volumes), b)).toBe('none')
    expect(narrowLevel(offerNarrow([['новая фраза']], volumes), b)).toBe('unknown')
    expect(narrowLevel(null, b)).toBe('unknown')
  })
  it('«кукла» темы не делает куклу высокой — решают её фразы; сверху больший спрос', () => {
    const topics = [{ topic_id: 'doll', name: 'Кукла', kind: 'type' as const, keywords: ['кукла'], match_terms: ['кукл'], is_active: true, volume_avg3: 13533, trend_pct: null, season_soon: false, our_total: 0, our_in_stock: 0 }]
    const offer = (caption: string, queries: string[][] | null) => ({ caption, items: null, queries })
    const list = [offer('кукла fashion', [['а б']]), offer('кукла барби', [['д е']]), offer('машинка', [['ж з']]), offer('кукла без фраз', null)]
    expect(filterByDemand(list, topics, 'high', volumes).map(o => o.caption)).toEqual(['машинка', 'кукла барби'])
    // Без точного спроса (нет миграции) — как прежде, по темам
    expect(filterByDemand(list, topics, 'high', null).length).toBe(0)
  })
})
