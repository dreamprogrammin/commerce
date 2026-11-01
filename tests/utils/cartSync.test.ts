import type { CartLine, ServerSyncMark } from '../../utils/cartSync'
import { describe, expect, it } from 'vitest'
import { cartSignature, decideCartSync, mergeCartLines } from '../../utils/cartSync'

/**
 * Корзина вошедшего в разных браузерах (1.11.2026): владелец положил товары в
 * одном браузере — в другом их не было, а бот напоминал о них в Telegram.
 */
const line = (productId: string, quantity = 1): CartLine => ({ productId, quantity })
const mark = (at: string, lines: CartLine[], userId = 'u1'): ServerSyncMark => ({ userId, at, signature: cartSignature(lines) })

describe('cartSignature', () => {
  it('порядок строк не важен, нулевые не считаются', () => {
    expect(cartSignature([line('b', 2), line('a')])).toBe(cartSignature([line('a'), line('b', 2), line('c', 0)]))
    expect(cartSignature([])).toBe('')
  })
})

describe('decideCartSync', () => {
  const decide = (m: ServerSyncMark | null, serverAt: string | null, local: CartLine[], userId = 'u1') =>
    decideCartSync({ userId, mark: m, server: serverAt ? { at: serverAt } : null, local })

  it('сервер изменили в другом браузере, своих правок нет — берём серверную (сюда же удаление и заказ)', () => {
    expect(decide(mark('t1', [line('a')]), 't2', [line('a')])).toBe('take-server')
  })

  it('открыл сайт уже вошедшим, своя корзина пуста — берём серверную (баг владельца)', () => {
    expect(decide(null, 't1', [])).toBe('take-server')
    expect(decide(mark('t1', []), 't2', [])).toBe('take-server')
  })

  it('сервер тот же, что видели: правок нет — ничего, есть — отправить', () => {
    expect(decide(mark('t1', [line('a')]), 't1', [line('a')])).toBe('nothing')
    expect(decide(mark('t1', [line('a')]), 't1', [line('a'), line('b')])).toBe('push')
  })

  it('правки с обеих сторон или вход с гостевой корзиной — объединить', () => {
    expect(decide(mark('t1', [line('a')]), 't2', [line('a'), line('b')])).toBe('merge')
    expect(decide(null, 't1', [line('g')])).toBe('merge')
  })

  it('метка другого пользователя не в счёт — как впервые', () => {
    expect(decide(mark('t1', [line('a')], 'other'), 't1', [line('a')])).toBe('merge')
  })

  it('на сервере корзины нет — отправить свою, если она не пуста', () => {
    expect(decide(null, null, [line('a')])).toBe('push')
    expect(decide(mark('t1', []), null, [])).toBe('nothing')
  })
})

describe('mergeCartLines', () => {
  it('всё, что есть хоть где-то; у общего — большее количество, не сумма', () => {
    expect(mergeCartLines([line('a', 2), line('b')], [line('b', 3), line('c')])).toEqual([line('a', 2), line('b', 3), line('c')])
  })
})
