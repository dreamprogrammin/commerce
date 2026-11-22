import { describe, expect, it } from 'vitest'
import { guessesOf, guessQueries, parseGuessReply } from '@/utils/offerGuess'

describe('parseGuessReply — ответ модели', () => {
  const topics = ['cars', 'kitchen', 'dolls']
  it('номер темы — по списку с 1; 0 и вне списка — «не подходит»', () => {
    const raw = JSON.stringify({ items: [
      { id: '0.0', query: 'Игровое кафе', topic: 2 },
      { id: '0.1', query: 'детское трюмо', topic: 0 },
      { id: '1.0', query: 'машинка на радиоуправлении', topic: 4 },
      { id: '2.0', query: 'коляска для кукол', topic: '3' },
    ] })
    const out = parseGuessReply(raw, ['0.0', '0.1', '1.0', '2.0'], topics)
    expect(Object.fromEntries(out)).toEqual({
      '0.0': { query: 'игровое кафе', topic: 'kitchen' },
      '0.1': { query: 'детское трюмо', topic: null },
      '1.0': { query: 'машинка на радиоуправлении', topic: null },
      '2.0': { query: 'коляска для кукол', topic: 'dolls' },
    })
  })
  it('запрос — по правилам точных фраз: одно слово, знаки, пусто — null; дефис — пробелом', () => {
    const raw = JSON.stringify({ items: [
      { id: 'a', query: 'машинки', topic: 1 },
      { id: 'b', query: '', topic: 0 },
      { id: 'c', query: 'фигурка человек-паук', topic: 0 },
      { id: 'd', query: 42, topic: 1.5 },
    ] })
    expect(Object.fromEntries(parseGuessReply(raw, ['a', 'b', 'c', 'd'], topics))).toEqual({
      a: { query: null, topic: 'cars' },
      b: { query: null, topic: null },
      c: { query: 'фигурка человек паук', topic: null },
      d: { query: null, topic: null },
    })
  })
  it('чужие и повторные id — мимо; JSON в ```json``` — разбирается; без items — ошибка', () => {
    const raw = '```json\n{"items":[{"id":"x","query":"игрушечный пылесос","topic":1},{"id":"x","query":"другое что то","topic":2},{"id":"чужой","query":"игровое кафе","topic":2}]}\n```'
    expect(Object.fromEntries(parseGuessReply(raw, ['x'], topics))).toEqual({ x: { query: 'игрушечный пылесос', topic: 'cars' } })
    expect(() => parseGuessReply('{"list":[]}', ['x'], topics)).toThrow('нет списка items')
  })
})

describe('guessesOf — разбор из базы', () => {
  it('по товарам поста; не объект — null; не массив — null', () => {
    expect(guessesOf([{ query: 'игровое кафе', topic: 'kitchen' }, null, 5, { query: '', topic: 7 }])).toEqual([
      { query: 'игровое кафе', topic: 'kitchen' },
      null,
      null,
      { query: null, topic: null },
    ])
    expect(guessesOf(null)).toBeNull()
    expect(guessesOf({ query: 'x' })).toBeNull()
  })
  it('запросы — в форме точных фраз для offerNarrow', () => {
    expect(guessQueries([{ query: 'игровое кафе', topic: null }, null, { query: null, topic: 'cars' }])).toEqual([['игровое кафе'], [], []])
    expect(guessQueries(null)).toBeNull()
  })
})
