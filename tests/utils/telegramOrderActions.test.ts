import { describe, expect, it } from 'vitest'
import {
  ACTION_FUNCTIONS,
  buildCallbackData,
  buildOrderKeyboard,
  parseCallbackData,
} from '@/supabase/functions/_shared/orderActions'

/**
 * Кнопки под карточкой заказа в Telegram. Проверяется то, что ломается молча:
 * лимит `callback_data` в 64 байта, разбор чужой строки и раскладка кнопок по
 * статусу — она собирается в двух функциях и раньше была там двумя копиями.
 */
describe('callback_data', () => {
  const uuid = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

  it('влезает в лимит Telegram', () => {
    for (const action of Object.keys(ACTION_FUNCTIONS)) {
      const data = buildCallbackData(action as any, 'guest_checkouts', uuid)
      expect(new TextEncoder().encode(data).length, data).toBeLessThanOrEqual(64)
    }
  })

  it('разбирается обратно без потерь', () => {
    for (const table of ['orders', 'guest_checkouts']) {
      const parsed = parseCallbackData(buildCallbackData('cfm', table, uuid))
      expect(parsed).toEqual({ action: 'cfm', table, orderId: uuid })
    }
  })

  /*
   * `callback_data` виден в разметке сообщения и приходит от клиента — то есть
   * это данные, а не доверенный код. Мусор не должен доходить до вызова
   * функции с чужим order_id.
   */
  it('мусор отбрасывается', () => {
    expect(parseCallbackData('')).toBeNull()
    expect(parseCallbackData('cfm')).toBeNull()
    expect(parseCallbackData('cfm:o')).toBeNull()
    expect(parseCallbackData('cfm:o:')).toBeNull()
    expect(parseCallbackData('drop:o:1')).toBeNull()
    expect(parseCallbackData('cfm:o:1:extra')).toBeNull()
  })

  it('неизвестная таблица читается как обычные заказы', () => {
    expect(parseCallbackData('cfm:x:1')?.table).toBe('orders')
  })
})

describe('клавиатура по статусу', () => {
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const texts = (status: string) =>
    (buildOrderKeyboard(status, 'orders', uuid)?.inline_keyboard ?? [])
      .flat()
      .map(b => b.text)

  /* Порядок повторяет реальный путь заказа: взять → подтвердить → курьеру → доставлен. */
  it('на каждом шаге своё главное действие', () => {
    expect(texts('new')[0]).toBe('✅ Взять в работу')
    expect(texts('pending')[0]).toBe('✅ Взять в работу')
    expect(texts('processing')[0]).toBe('✅ Подтвердить')
    expect(texts('confirmed')[0]).toBe('🚚 Передать курьеру')
    expect(texts('shipped')[0]).toBe('✅ Доставлен')
  })

  it('отменить можно на любом шаге, где есть кнопки', () => {
    for (const status of ['new', 'pending', 'processing', 'confirmed', 'shipped'])
      expect(texts(status), status).toContain('❌ Отменить')
  })

  /*
   * У доставленного и отменённого заказа действий не осталось. Раньше кнопки
   * просто не рисовались веткой `if`, теперь это явное `null` — и «Отменить»
   * под доставленным заказом не появится.
   */
  it('у завершённого заказа кнопок нет', () => {
    expect(buildOrderKeyboard('delivered', 'orders', uuid)).toBeNull()
    expect(buildOrderKeyboard('completed', 'orders', uuid)).toBeNull()
    expect(buildOrderKeyboard('cancelled', 'orders', uuid)).toBeNull()
  })

  it('кнопки несут callback, а не ссылку с секретом', () => {
    const keyboard = buildOrderKeyboard('new', 'orders', uuid)!
    for (const button of keyboard.inline_keyboard.flat()) {
      expect(button).toHaveProperty('callback_data')
      expect(button).not.toHaveProperty('url')
      expect(JSON.stringify(button)).not.toContain('secret')
    }
  })

  it('каждое действие знает свою функцию', () => {
    expect(ACTION_FUNCTIONS.asg).toBe('assign-order-to-admin')
    expect(ACTION_FUNCTIONS.cnl).toBe('cancel-order')
    expect(Object.keys(ACTION_FUNCTIONS)).toHaveLength(5)
  })
})
