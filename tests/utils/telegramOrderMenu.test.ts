import { describe, expect, it } from 'vitest'
import {
  buildCardActionData,
  buildCardData,
  buildCardKeyboard,
  buildListKeyboard,
  buildPanelKeyboard,
  parseMenuData,
} from '@/supabase/functions/_shared/orderMenu'

const UUID = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

function order(patch: Record<string, unknown> = {}) {
  return {
    id: UUID,
    status: 'new',
    final_amount: 16480,
    created_at: '2026-09-03T10:00:00Z',
    table: 'orders',
    ...patch,
  } as any
}

/**
 * Панель — то, ради чего всё делалось: менеджер не печатает команд, он жмёт
 * кнопки. Проверяется навигация между экранами и лимиты Telegram, которые
 * ломаются молча.
 */
describe('данные кнопок', () => {
  it('влезают в лимит Telegram даже для гостевого заказа', () => {
    const longest = buildCardActionData('asg', 'm', 'guest_checkouts', UUID)
    expect(new TextEncoder().encode(longest).length).toBeLessThanOrEqual(64)
  })

  it('разбираются обратно', () => {
    expect(parseMenuData(buildCardData('a', 'orders', UUID)))
      .toEqual({ kind: 'card', scope: 'a', table: 'orders', orderId: UUID })
    expect(parseMenuData(buildCardActionData('cfm', 'm', 'guest_checkouts', UUID)))
      .toEqual({ kind: 'card-action', action: 'cfm', scope: 'm', table: 'guest_checkouts', orderId: UUID })
    expect(parseMenuData('pnl:a')).toEqual({ kind: 'panel', scope: 'a' })
    expect(parseMenuData('mnu:m')).toEqual({ kind: 'menu', scope: 'm' })
    expect(parseMenuData('cls')).toEqual({ kind: 'close' })
  })

  /*
   * Кнопка панели и кнопка внутри своего экрана РАЗНЫЕ намеренно: панель одна
   * на чат и присылает новое сообщение, «Обновить» правит своё. Спутай их —
   * и либо панель перепишется под одного менеджера, либо «Обновить» начнёт
   * плодить сообщения.
   */
  it('панель и обновление списка различаются', () => {
    expect(parseMenuData('pnl:a')!.kind).toBe('panel')
    expect(parseMenuData('mnu:a')!.kind).toBe('menu')
  })

  it('чужое не разбирается', () => {
    expect(parseMenuData('')).toBeNull()
    expect(parseMenuData('mnu')).toBeNull()
    expect(parseMenuData('mnu:x')).toBeNull()
    expect(parseMenuData('ord:a:o')).toBeNull()
    expect(parseMenuData('act:cfm:a:o')).toBeNull()
  })
})

describe('экраны', () => {
  it('на панели два входа', () => {
    const texts = buildPanelKeyboard().inline_keyboard.flat().map(b => b.text)
    expect(texts).toEqual(['📋 Активные заказы', '👤 Мои заказы'])
  })

  it('в списке кнопка на каждый заказ плюс обновить и закрыть', () => {
    const keyboard = buildListKeyboard([order(), order({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })], 'a')
    const rows = keyboard.inline_keyboard
    expect(rows).toHaveLength(3)
    expect(rows[0][0].text).toContain('5e4fc2')
    expect(rows[0][0].text).toContain('16 480 ₸')
    expect(rows[2].map(b => b.text)).toEqual(['🔄 Обновить', '✖️ Закрыть'])
  })

  /* Экран телефона всё равно кончается, а разбирать надо сверху. */
  it('список не длиннее десяти заказов', () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      order({ id: `${i}`.padStart(8, '0') + '-0000-0000-0000-000000000000' }))
    const rows = buildListKeyboard(many, 'a').inline_keyboard
    expect(rows).toHaveLength(11)
  })

  it('пустой список всё равно даёт выход', () => {
    expect(buildListKeyboard([], 'm').inline_keyboard).toHaveLength(1)
  })

  it('на карточке действие, отмена и возврат в тот же список', () => {
    const texts = buildCardKeyboard('new', 'm', 'orders', UUID).inline_keyboard.flat()
    expect(texts.map(b => b.text)).toEqual(['✅ Взять в работу', '❌ Отменить', '← К списку', '✖️ Закрыть'])
    expect(texts.find(b => b.text === '← К списку')!.callback_data).toBe('mnu:m')
  })

  it('у завершённого заказа остаётся только навигация', () => {
    for (const status of ['delivered', 'completed', 'cancelled']) {
      const texts = buildCardKeyboard(status, 'a', 'orders', UUID).inline_keyboard.flat().map(b => b.text)
      expect(texts, status).toEqual(['← К списку', '✖️ Закрыть'])
    }
  })

  it('шаги идут в порядке работы заказа', () => {
    const first = (status: string) =>
      buildCardKeyboard(status, 'a', 'orders', UUID).inline_keyboard[0][0].text
    expect(first('new')).toBe('✅ Взять в работу')
    expect(first('processing')).toBe('✅ Подтвердить')
    expect(first('confirmed')).toBe('🚚 Передать курьеру')
    expect(first('shipped')).toBe('✅ Доставлен')
  })
})
