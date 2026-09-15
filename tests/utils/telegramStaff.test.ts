import { describe, expect, it } from 'vitest'
import {
  applicationMessage,
  buildApprovalKeyboard,
  buildFireConfirmKeyboard,
  buildRoleKeyboard,
  buildTeamKeyboard,
  canFire,
  canManageOrders,
  canManageStaff,
  fireConfirmText,
  firedResultText,
  isStrictMode,
  looksLikeName,
  looksLikePhone,
  nextStep,
  orderWord,
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
    expect(parseJobData('job:rm:abc')).toEqual({ kind: 'fire', staffId: 'abc' })
    expect(parseJobData('job:rmok:abc')).toEqual({ kind: 'fireConfirm', staffId: 'abc' })
    expect(parseJobData('job:rmno')).toEqual({ kind: 'fireCancel' })
  })

  it('чужое не разбирается', () => {
    expect(parseJobData('mnu:a')).toBeNull()
    expect(parseJobData('job:role:owner')).toBeNull()
    expect(parseJobData('job:ok')).toBeNull()
    // Увольнение без того, кого увольняют, — не действие, а мусор.
    expect(parseJobData('job:rm')).toBeNull()
    expect(parseJobData('job:rmok')).toBeNull()
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

  /*
   * Уволенный вправе подать заявку заново — бот его не помнит, а владелец
   * помнит не всегда. Дата считается по Алматы: 22:30 UTC — это уже
   * следующий день в магазине.
   */
  it('про прошлое увольнение видно прямо в заявке', () => {
    const text = applicationMessage(draft({
      full_name: 'Данияр',
      role: 'courier',
      status: 'pending',
      fired_at: '2026-09-14T22:30:00Z',
    }))
    expect(text).toContain('увольняли')
    expect(text).toContain('15.09.2026')
  })

  it('у того, кого не увольняли, такой строки нет', () => {
    expect(applicationMessage(draft({ full_name: 'Айгуль' }))).not.toContain('увольняли')
  })

  it('битая дата не роняет заявку и не печатает «Invalid Date»', () => {
    const text = applicationMessage(draft({ full_name: 'Данияр', fired_at: 'не дата' }))
    expect(text).toContain('увольняли')
    expect(text).not.toContain('Invalid')
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

/**
 * Увольнение. Принимать людей бот умел с самого начала, убирать — нет, и
 * уволенный оставался с кнопками заказов до тех пор, пока его не удалят из
 * `staff` руками в дашборде.
 */
describe('увольнение', () => {
  const person = (patch: Record<string, unknown>) => draft({ status: 'approved', ...patch })
  const owner = person({ id: 'own-1', role: 'owner', full_name: 'Малик' })
  const manager = person({ id: 'mgr-1', role: 'manager', full_name: 'Айгуль' })
  const courier = person({ id: 'crr-1', role: 'courier', full_name: 'Данияр' })

  it('владелец увольняет менеджера и курьера', () => {
    expect(canFire(owner, manager, 1)).toEqual({ ok: true })
    expect(canFire(owner, courier, 1)).toEqual({ ok: true })
  })

  /* Отобрать доступ у работающего — не то право, что раздаётся «кому-то из чата». */
  it('менеджер, курьер и посторонний не увольняют никого', () => {
    expect(canFire(manager, courier, 1).ok).toBe(false)
    expect(canFire(courier, manager, 1).ok).toBe(false)
    expect(canFire(null, manager, 1).ok).toBe(false)
    // И непринятый владелец тоже: статус решает, а не роль в анкете.
    expect(canFire(draft({ role: 'owner', status: 'pending' }), manager, 1).ok).toBe(false)
  })

  it('себя уволить нельзя', () => {
    const verdict = canFire(owner, owner, 2)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.reason).toContain('Себя')
  })

  /*
   * Без единого владельца включается мягкий режим, где заявки принимает любой
   * из рабочего чата. Увольнение последнего владельца раздавало бы права
   * вместо того, чтобы их отбирать.
   */
  it('последнего владельца не уволить, второго — можно', () => {
    const second = person({ id: 'own-2', role: 'owner', full_name: 'Второй' })
    expect(canFire(owner, second, 1).ok).toBe(false)
    expect(canFire(owner, second, 2)).toEqual({ ok: true })
  })

  it('уволенного второй раз не уволить, а заявку отклоняют кнопкой под ней', () => {
    expect(canFire(owner, person({ id: 'x', role: 'courier', status: 'fired' }), 1).ok).toBe(false)
    expect(canFire(owner, draft({ id: 'y', role: 'courier', status: 'pending' }), 1).ok).toBe(false)
    expect(canFire(owner, null, 1).ok).toBe(false)
  })

  it('причина отказа приходит текстом — иначе кнопка «просто не работает»', () => {
    const verdict = canFire(manager, courier, 1)
    expect(verdict.ok === false && verdict.reason.length).toBeGreaterThan(0)
  })
})

describe('кнопки увольнения', () => {
  const person = (patch: Record<string, unknown>) => draft({ status: 'approved', ...patch })
  const owner = person({ id: 'own-1', role: 'owner', full_name: 'Малик' })
  const manager = person({ id: 'mgr-1', role: 'manager', full_name: 'Айгуль' })
  const courier = person({ id: 'crr-1', role: 'courier', full_name: 'Данияр' })

  const buttons = (kb: { inline_keyboard: { text: string, callback_data: string }[][] } | null) =>
    (kb?.inline_keyboard ?? []).flat()

  it('владельцу — кнопка на каждого в команде, кроме себя', () => {
    const texts = buttons(buildTeamKeyboard([owner, manager, courier], 'own-1')).map(b => b.text)
    expect(texts).toEqual(['🚪 Уволить · Айгуль', '🚪 Уволить · Данияр'])
  })

  it('кнопка ведёт к тому, на кого нажали', () => {
    const data = buttons(buildTeamKeyboard([owner, courier], 'own-1'))[0].callback_data
    expect(parseJobData(data)).toEqual({ kind: 'fire', staffId: 'crr-1' })
  })

  /* Кнопка, которая заведомо ответит отказом, в списке не нужна. */
  it('менеджер кнопок не видит вовсе', () => {
    expect(buildTeamKeyboard([owner, manager, courier], 'mgr-1')).toBeNull()
  })

  it('ждущих решения и уволенных в кнопках нет', () => {
    const texts = buttons(buildTeamKeyboard([
      owner,
      draft({ id: 'p-1', role: 'manager', status: 'pending', full_name: 'Ждёт' }),
      person({ id: 'f-1', role: 'courier', status: 'fired', full_name: 'Уже ушёл' }),
    ], 'own-1')).map(b => b.text)
    expect(texts).toEqual([])
  })

  /* Telegram отвергает `inline_keyboard: []` — отсюда null вместо пустой. */
  it('когда увольнять некого — клавиатуры нет', () => {
    expect(buildTeamKeyboard([owner], 'own-1')).toBeNull()
    expect(buildTeamKeyboard([], null)).toBeNull()
  })

  it('больше десяти кнопок не показываем', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      person({ id: `m-${i}`, role: 'manager', full_name: `Менеджер ${i}` }))
    expect(buttons(buildTeamKeyboard([owner, ...many], 'own-1'))).toHaveLength(10)
  })

  it('подтверждение спрашивают отдельной кнопкой', () => {
    const kb = buildFireConfirmKeyboard('crr-1')
    expect(kb.inline_keyboard.flat().map(b => b.text)).toEqual(['🚪 Да, уволить', '↩️ Отмена'])
    expect(parseJobData(kb.inline_keyboard[0][0].callback_data))
      .toEqual({ kind: 'fireConfirm', staffId: 'crr-1' })
    expect(parseJobData(kb.inline_keyboard[0][1].callback_data)).toEqual({ kind: 'fireCancel' })
  })
})

describe('что показывают при увольнении', () => {
  const courier = draft({
    id: 'crr-1',
    role: 'courier',
    status: 'approved',
    full_name: 'Данияр',
  })

  it('перед увольнением видно, кого и с чем на руках', () => {
    const text = fireConfirmText(courier, 2)
    expect(text).toContain('Данияр')
    expect(text).toContain('Курьер')
    expect(text).toContain('2 заказа')
  })

  /* Незакрытых нет — и предупреждения быть не должно. */
  it('без незакрытых заказов лишнего не пишем', () => {
    expect(fireConfirmText(courier, 0)).not.toContain('⚠️')
  })

  it('после увольнения в чате остаётся, кто решил и что осталось', () => {
    const text = firedResultText(courier, 'Малик', 1)
    expect(text).toContain('Данияр')
    expect(text).toContain('Малик')
    expect(text).toContain('За ним ещё 1 заказ')
    expect(firedResultText(courier, 'Малик', 0)).not.toContain('⚠️')
  })

  it('число заказов склоняется', () => {
    expect(orderWord(1)).toBe('заказ')
    expect(orderWord(2)).toBe('заказа')
    expect(orderWord(5)).toBe('заказов')
    expect(orderWord(11)).toBe('заказов')
    expect(orderWord(21)).toBe('заказ')
    expect(orderWord(112)).toBe('заказов')
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

  /* «Отклонён» — это тот, кого не взяли. Уволенный работал; путать нельзя. */
  it('уволенные считаются отдельно от отклонённых и из состава пропадают', () => {
    const text = staffListMessage([
      draft({ full_name: 'Айгуль', role: 'manager', status: 'approved' }),
      draft({ full_name: 'Данияр', role: 'courier', status: 'fired' }),
      draft({ full_name: 'Кто-то', status: 'rejected' }),
    ])
    expect(text).toContain('Уволенных: 1')
    expect(text).toContain('Отклонённых: 1')
    expect(text).toContain('Айгуль')
    expect(text).not.toContain('Данияр')
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
