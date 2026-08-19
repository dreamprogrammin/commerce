import { describe, expect, it } from 'vitest'
import { isWholeRange } from '@/utils/catalogFilterRange'

describe('isWholeRange', () => {
  /*
   * Ради этого всё и делается. Заглушка [0, 50000] стоит в фильтре до ответа
   * сервера, реальные границы приходят после. Оба состояния обязаны давать
   * один ответ, иначе ключ запроса меняется между посевом кеша на сервере и
   * отрисовкой, и категория отдаётся со скелетонами.
   */
  it('одинаково отвечает до и после загрузки границ', () => {
    const заглушка = isWholeRange([0, 50000], { min: 0, max: 50000 })
    const реальные = isWholeRange([490, 89900], { min: 490, max: 89900 })

    expect(заглушка).toBe(true)
    expect(реальные).toBe(true)
  })

  it('сужение с любой стороны — это фильтр', () => {
    expect(isWholeRange([1000, 89900], { min: 490, max: 89900 })).toBe(false)
    expect(isWholeRange([490, 50000], { min: 490, max: 89900 })).toBe(false)
    expect(isWholeRange([1000, 50000], { min: 490, max: 89900 })).toBe(false)
  })

  it('пока границы неизвестны, фильтра нет', () => {
    expect(isWholeRange([1000, 5000], null)).toBe(true)
    expect(isWholeRange([1000, 5000], undefined)).toBe(true)
  })

  it('пустое значение — тоже не фильтр', () => {
    expect(isWholeRange(null, { min: 0, max: 10 })).toBe(true)
    expect(isWholeRange(undefined, { min: 0, max: 10 })).toBe(true)
  })
})
