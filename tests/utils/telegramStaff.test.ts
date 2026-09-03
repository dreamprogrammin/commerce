import { describe, expect, it } from 'vitest'
import {
  applicationMessage,
  buildApprovalKeyboard,
  buildRoleKeyboard,
  canManageOrders,
  isStrictMode,
  looksLikeName,
  looksLikePhone,
  nextStep,
  parseJobData,
} from '@/supabase/functions/_shared/staff'

const draft = (patch = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  telegram_user_id: 42,
  telegram_username: 'aigul_m',
  full_name: null,
  phone: null,
  role: null,
  status: 'draft',
  ...patch,
} as any)

/**
 * Анкета идёт по шагам, а функция бота не помнит ничего между сообщениями:
 * следующий вопрос выводится из того, каких полей в заявке не хватает.
 */
describe('шаги анкеты', () => {
  it('пустая заявка начинается с имени', () => {
    expect(nextStep(null)).toBe('name')
    expect(nextStep(draft())).toBe('name')
  })

  it('дальше телефон, потом роль, потом готово', () => {
    expect(nextStep(draft({ full_name: 'Айгуль' }))).toBe('phone')
    expect(nextStep(draft({ full_name: 'Айгуль', phone: '+77010000000' }))).toBe('role')
    expect(nextStep(draft({ full_name: 'Айгуль', phone: '+77010000000', role: 'courier' }))).toBeNull()
  })

  it('пробелы вместо имени за ответ не считаются', () => {
    expect(nextStep(draft({ full_name: '   ' }))).toBe('name')
  })
})

describe('проверка ответов', () => {
  /* Живые записи номера: со скобками, дефисами, через 8. Строгая маска их бы отсекла. */
  it('телефон узнаётся в любой записи', () => {
    expect(looksLikePhone('+7 701 000 00 00')).toBe(true)
    expect(looksLikePhone('8(701)000-00-00')).toBe(true)
    expect(looksLikePhone('87010000000')).toBe(true)
  })

  it('не телефон отсекается', () => {
    expect(looksLikePhone('позвоните мне')).toBe(false)
    expect(looksLikePhone('+7 701')).toBe(false)
  })

  it('имя в одно слово принимается, команда — нет', () => {
    expect(looksLikeName('Айгуль')).toBe(true)
    expect(looksLikeName('Айгуль Смагулова')).toBe(true)
    expect(looksLikeName('/start')).toBe(false)
    expect(looksLikeName('я')).toBe(false)
  })
})

describe('кнопки', () => {
  it('роль выбирается кнопкой, а не текстом', () => {
    const texts = buildRoleKeyboard().inline_keyboard.flat().map(b => b.text)
    expect(texts).toEqual(['👤 Менеджер', '🚗 Курьер'])
  })

  it('данные кнопок разбираются обратно', () => {
    expect(parseJobData('job:role:courier')).toEqual({ kind: 'role', role: 'courier' })
    expect(parseJobData('job:ok:abc')).toEqual({ kind: 'approve', staffId: 'abc' })
    expect(parseJobData('job:no:abc')).toEqual({ kind: 'reject', staffId: 'abc' })
  })

  it('чужое не разбирается', () => {
    expect(parseJobData('mnu:a')).toBeNull()
    expect(parseJobData('job:role:owner')).toBeNull()
    expect(parseJobData('job:ok')).toBeNull()
  })

  it('под заявкой две кнопки владельцу', () => {
    const texts = buildApprovalKeyboard('id-1').inline_keyboard.flat().map(b => b.text)
    expect(texts).toEqual(['✅ Принять', '❌ Отклонить'])
  })
})

describe('допуск к заказам', () => {
  /*
   * Пока нет ни одного подтверждённого менеджера, работает старое правило —
   * по присутствию в рабочем чате. Иначе первый же выкат заблокировал бы
   * владельца: он ещё не успел подать заявку сам себе.
   */
  it('без подтверждённых менеджеров режим мягкий', () => {
    expect(isStrictMode(0)).toBe(false)
    expect(canManageOrders(null, false)).toBe(true)
  })

  it('как только менеджер появился — строгий', () => {
    expect(isStrictMode(1)).toBe(true)
    expect(canManageOrders(null, true)).toBe(false)
  })

  it('в строгом режиме пускают только подтверждённых менеджеров', () => {
    const approved = (role: string) => draft({ role, status: 'approved' })
    expect(canManageOrders(approved('manager'), true)).toBe(true)
    expect(canManageOrders(approved('owner'), true)).toBe(true)
    // Курьер заказами не управляет: он их возит.
    expect(canManageOrders(approved('courier'), true)).toBe(false)
    expect(canManageOrders(draft({ role: 'manager', status: 'pending' }), true)).toBe(false)
    expect(canManageOrders(draft({ role: 'manager', status: 'rejected' }), true)).toBe(false)
  })
})

describe('заявка владельцу', () => {
  it('несёт всё, по чему принимают решение', () => {
    const text = applicationMessage(draft({
      full_name: 'Данияр', phone: '+7 701 000 00 00', role: 'courier', status: 'pending',
    }))
    expect(text).toContain('Данияр')
    expect(text).toContain('+7 701 000 00 00')
    expect(text).toContain('Курьер')
    expect(text).toContain('@aigul_m')
  })

  it('без ника строка про Telegram не появляется пустой', () => {
    const text = applicationMessage(draft({ telegram_username: null, full_name: 'Данияр' }))
    expect(text).not.toContain('Telegram:')
  })
})
