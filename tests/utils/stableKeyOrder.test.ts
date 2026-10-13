import { describe, expect, it } from 'vitest'
import { shallowReactive } from 'vue'
import { sortKeysInPlace } from '@/utils/stableKeyOrder'

/*
 * Nuxt кладёт `payload.data[ключ]` и `payload._errors[ключ]` в момент, когда
 * `useAsyncData` завершился, — в порядке ответов. 13 октября 2026 разделы
 * («Куклы», «Батарейки») на каждом холодном старте сервера давали HTML,
 * отличный от прогретого, только порядком ключей `_errors` — и это платная
 * запись ISR при неизменных данных.
 */
describe('sortKeysInPlace', () => {
  it('одни и те же ключи, вставленные в разном порядке, сериализуются одинаково', () => {
    const cold = shallowReactive<Record<string, unknown>>({})
    cold['catalog-products-in-branch'] = undefined
    cold['footer-categories'] = undefined
    cold['footer-popular-products'] = undefined

    const warm = shallowReactive<Record<string, unknown>>({})
    warm['footer-categories'] = undefined
    warm['footer-popular-products'] = undefined
    warm['catalog-products-in-branch'] = undefined

    sortKeysInPlace(cold)
    sortKeysInPlace(warm)

    expect(Object.keys(cold)).toEqual(Object.keys(warm))
    expect(JSON.stringify(cold)).toBe(JSON.stringify(warm))
  })

  it('тот же объект, значения и ключи с undefined на месте', () => {
    const target = shallowReactive<Record<string, unknown>>({ b: 2, a: { x: 1 }, c: undefined })
    const a = target.a

    sortKeysInPlace(target)

    expect(Object.keys(target)).toEqual(['a', 'b', 'c'])
    expect(target.a).toBe(a)
    expect(target.b).toBe(2)
    expect('c' in target).toBe(true)
  })

  it('пустой и отсутствующий объект — без ошибок', () => {
    expect(() => sortKeysInPlace({})).not.toThrow()
    expect(() => sortKeysInPlace(undefined)).not.toThrow()
  })
})
