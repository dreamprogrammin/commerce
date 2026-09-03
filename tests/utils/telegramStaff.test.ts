import { describe, expect, it } from 'vitest'
import {
  applicationMessage,
  buildApprovalKeyboard,
  buildRoleKeyboard,
  canManageOrders,
  canManageStaff,
  isStrictMode,
  looksLikeName,
  looksLikePhone,
  nextStep,
  parseJobData,
  staffLine,
  staffListMessage,
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

/**
 * Владелец. В `staff` он попадает миграцией (его Telegram-id берётся из
 * profiles, где role = 'admin'), а не через анкету: подавать заявку самому
 * себе и самому же её принимать — странно, а до этого строгий режим вообще
 * не включился бы.
 */
describe('права владельца', () => {
  const owner = draft({ role: 'owner', status: 'approved' })
  const manager = draft({ role: 'manager', status: 'approved' })

  it('решает по заявкам только владелец', () => {
    expect(canManageStaff(owner, true)).toBe(true)
    // Менеджер ведёт заказы, но кого пускать в систему — не его решение.
    expect(canManageStaff(manager, true)).toBe(false)
    expect(canManageStaff(null, true)).toBe(false)
  })

  /* Пока владельца нет, первую заявку принять было бы некому. */
  it('до появления владельца решает любой из рабочего чата', () => {
    expect(canManageStaff(null, false)).toBe(true)
  })

  it('владелец управляет и заказами тоже', () => {
    expect(canManageOrders(owner, true)).toBe(true)
  })
})

describe('список команды', () => {
  it('пустой список подсказывает, что делать', () => {
    expect(staffListMessage([])).toContain('/job')
  })

  it('ждущие решения идут отдельно от принятых', () => {
    const text = staffListMessage([
      draft({ full_name: 'Айгуль', role: 'manager', status: 'approved' }),
      draft({ full_name: 'Данияр', role: 'courier', status: 'pending', telegram_username: null }),
    ])
    expect(text.indexOf('Ждут решения')).toBeLessThan(text.indexOf('В команде'))
    expect(text).toContain('Данияр')
    expect(text).toContain('Курьер')
  })

  it('отклонённые не занимают место, но счёт виден', () => {
    const text = staffListMessage([draft({ full_name: 'Кто-то', status: 'rejected' })])
    expect(text).toContain('Отклонённых: 1')
    expect(text).not.toContain('Кто-то')
  })

  it('строка сотрудника несёт роль, ник и телефон', () => {
    const line = staffLine(draft({
      full_name: 'Айгуль', role: 'manager', status: 'approved', phone: '+77015554433',
    }))
    expect(line).toContain('Айгуль')
    expect(line).toContain('Менеджер')
    expect(line).toContain('@aigul_m')
    expect(line).toContain('+77015554433')
  })
})
