import { describe, expect, it } from 'vitest'
import {
  assignedTo,
  customerName,
  formatAmount,
  orderCardMessage,
  orderListMessage,
  shortNumber,
  statusLabel,
  timeAgo,
} from '@/supabase/functions/_shared/orderCard'

const NOW = new Date('2026-09-03T12:00:00Z')

/**
 * Убирает экранирование перед сравнением.
 *
 * `escapeMarkdown` в проекте экранирует полный набор MarkdownV2 (`+`, `-`,
 * `.`, скобки), а сообщения уходят с `parse_mode: 'Markdown'` — это отдельный
 * баг, из-за которого в чате видны лишние слеши. Проверять здесь надо смысл
 * («телефон на месте»), а не способ экранирования: иначе тесты придётся
 * переписывать вместе с починкой, хотя проверяют они не её.
 */
function plain(text: string): string {
  return text.replace(/\\(.)/g, '$1')
}

function order(patch: Record<string, unknown> = {}) {
  return {
    id: '1cfa2733-8c56-495d-be05-69807f5e4fc2',
    status: 'processing',
    final_amount: 12400,
    created_at: '2026-09-03T10:00:00Z',
    customer_name: 'Айгерим',
    customer_phone: '+7 701 000-00-00',
    delivery_method: 'courier',
    delivery_address: { city: 'Алматы', line1: 'ул. Абая 10' },
    assigned_admin_name: null,
    assigned_admin_username: null,
    table: 'orders',
    ...patch,
  } as any
}

describe('номер и суммы', () => {
  it('номер — те же шесть знаков, что видит покупатель', () => {
    expect(shortNumber('1cfa2733-8c56-495d-be05-69807f5e4fc2')).toBe('5e4fc2')
  })

  it('сумма без копеек и с разделителем', () => {
    expect(formatAmount(12400)).toBe('12 400 ₸')
    expect(formatAmount('1990.00')).toBe('1 990 ₸')
    expect(formatAmount(null)).toBe('0 ₸')
  })

  it('мусор в сумме не роняет сообщение', () => {
    expect(formatAmount('не число' as any)).toBe('0 ₸')
  })
})

describe('время', () => {
  it('считает по-русски и по делу', () => {
    expect(timeAgo('2026-09-03T11:58:00Z', NOW)).toBe('2 мин назад')
    expect(timeAgo('2026-09-03T09:00:00Z', NOW)).toBe('3 ч назад')
    expect(timeAgo('2026-09-02T09:00:00Z', NOW)).toBe('вчера')
    expect(timeAgo('2026-08-30T09:00:00Z', NOW)).toBe('4 дн назад')
  })

  /* Часы на сервере и в базе могут разойтись — «через минуту» смотрелось бы дико. */
  it('время из будущего показывается как «только что»', () => {
    expect(timeAgo('2026-09-03T12:05:00Z', NOW)).toBe('только что')
  })
})

describe('кто ведёт заказ', () => {
  it('никто — так и написано', () => {
    expect(assignedTo(order())).toBe('никто не взял')
  })

  /* Ник нужен, чтобы человека можно было позвать прямо в чате. */
  it('имя с ником, когда ник известен', () => {
    expect(assignedTo(order({
      assigned_admin_name: 'Айгуль Смагулова',
      assigned_admin_username: 'aigul_m',
    }))).toBe('Айгуль Смагулова (@aigul_m)')
  })

  it('без ника — одно имя', () => {
    expect(assignedTo(order({ assigned_admin_name: 'Данияр' }))).toBe('Данияр')
  })
})

describe('гостевой заказ', () => {
  it('имя берётся из своего поля', () => {
    const guest = order({ customer_name: null, guest_name: 'Марат', table: 'guest_checkouts' })
    expect(customerName(guest)).toBe('Марат')
    expect(plain(orderCardMessage(guest, NOW))).toContain('Заказ без регистрации')
  })

  it('без имени вовсе — не пустая строка', () => {
    expect(customerName(order({ customer_name: null }))).toBe('Покупатель')
  })
})

describe('карточка заказа', () => {
  it('несёт то, ради чего её открывают', () => {
    const text = plain(orderCardMessage(order(), NOW))
    expect(text).toContain('Заказ №5e4fc2')
    expect(text).toContain('12 400 ₸')
    expect(text).toContain('Айгерим')
    expect(text).toContain('+7 701 000-00-00')
    expect(text).toContain('Алматы, ул. Абая 10')
    expect(text).toContain('2 ч назад')
  })

  it('у самовывоза адреса нет', () => {
    const text = plain(orderCardMessage(order({ delivery_method: 'pickup' }), NOW))
    expect(text).toContain('самовывоз')
    expect(text).not.toContain('ул. Абая')
  })

  it('статусы подписаны по-русски', () => {
    expect(statusLabel('shipped')).toContain('в пути')
    expect(statusLabel('completed')).toBe(statusLabel('delivered'))
    // Неизвестный статус показываем как есть — лучше сырое слово, чем пустота.
    expect(statusLabel('какой-то')).toBe('какой-то')
  })
})

describe('список заказов', () => {
  it('пустой список говорит об этом словами', () => {
    expect(orderListMessage([], 'Активные заказы', 'Пусто — все заказы закрыты.'))
      .toContain('Пусто — все заказы закрыты.')
  })

  it('в строке есть номер, статус, сумма и кто ведёт', () => {
    const text = plain(orderListMessage(
      [order({ assigned_admin_name: 'Данияр', assigned_admin_username: 'dan' })],
      'Активные заказы',
      'пусто',
      NOW,
    ))
    expect(text).toContain('`5e4fc2`')
    expect(text).toContain('в работе')
    expect(text).toContain('12 400 ₸')
    expect(text).toContain('Данияр (@dan)')
    expect(text).toContain('*Активные заказы* — 1')
  })
})
