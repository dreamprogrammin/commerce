/**
 * Анкета сотрудника и допуск к работе с заказами.
 *
 * ЗАЧЕМ. Управлять заказами в Telegram мог кто угодно, кого добавили в
 * рабочий чат: проверка шла по номеру чата, а не по человеку. Владелец
 * выбрал путь с анкетой — новый человек оставляет имя, телефон и желаемую
 * роль, а владелец подтверждает заявку кнопкой.
 *
 * СОСТОЯНИЕ ДИАЛОГА ЖИВЁТ В БАЗЕ, а не в памяти функции: функция без
 * состояния, между двумя сообщениями она ничего не помнит. По тому, каких
 * полей в заявке не хватает, и понятно, что спрашивать дальше.
 */

export type StaffRole = 'manager' | 'courier' | 'owner'
export type StaffStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface StaffRecord {
  id: string
  telegram_user_id: number
  telegram_username: string | null
  full_name: string | null
  phone: string | null
  role: StaffRole | null
  status: StaffStatus
}

/** Что бот спросит следующим. `null` — анкета заполнена. */
export type StaffStep = 'name' | 'phone' | 'role' | null

export function nextStep(record: StaffRecord | null): StaffStep {
  if (!record)
    return 'name'
  if (!record.full_name?.trim())
    return 'name'
  if (!record.phone?.trim())
    return 'phone'
  if (!record.role)
    return 'role'
  return null
}

export const STEP_QUESTIONS: Record<Exclude<StaffStep, null>, string> = {
  name: 'Как вас зовут? Напишите имя и фамилию.',
  phone: 'Ваш номер телефона? Например: +7 701 000 00 00',
  role: 'Кем будете работать?',
}

/**
 * Телефон нужен, чтобы с человеком можно было связаться, поэтому проверка
 * мягкая: считаем номером всё, где не меньше десяти цифр. Строгая маска
 * отсекала бы живые варианты записи — со скобками, дефисами, «8» вместо «+7».
 */
export function looksLikePhone(text: string): boolean {
  return (text.match(/\d/g) ?? []).length >= 10
}

/** Имя в одно слово тоже принимаем: фамилию человек может и не назвать. */
export function looksLikeName(text: string): boolean {
  const clean = text.trim()
  return clean.length >= 2 && clean.length <= 80 && !/^\//.test(clean)
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  manager: 'Менеджер',
  courier: 'Курьер',
  owner: 'Владелец',
}

/** Кнопки выбора роли в анкете. */
export function buildRoleKeyboard() {
  return {
    inline_keyboard: [[
      { text: '👤 Менеджер', callback_data: 'job:role:manager' },
      { text: '🚗 Курьер', callback_data: 'job:role:courier' },
    ]],
  }
}

/** Кнопки владельцу под заявкой. */
export function buildApprovalKeyboard(staffId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Принять', callback_data: `job:ok:${staffId}` },
        { text: '❌ Отклонить', callback_data: `job:no:${staffId}` },
      ],
    ],
  }
}

export interface ParsedJobData {
  kind: 'role' | 'approve' | 'reject'
  role?: StaffRole
  staffId?: string
}

export function parseJobData(data: string): ParsedJobData | null {
  const parts = data.split(':')
  if (parts[0] !== 'job')
    return null

  if (parts[1] === 'role' && (parts[2] === 'manager' || parts[2] === 'courier'))
    return { kind: 'role', role: parts[2] }

  if ((parts[1] === 'ok' || parts[1] === 'no') && parts[2])
    return { kind: parts[1] === 'ok' ? 'approve' : 'reject', staffId: parts[2] }

  return null
}

/** Заявка в том виде, в каком она уходит владельцу. */
export function applicationMessage(record: StaffRecord): string {
  return [
    '*Новая заявка на работу*',
    '',
    `*Имя:* ${record.full_name ?? '—'}`,
    `*Телефон:* ${record.phone ?? '—'}`,
    `*Роль:* ${record.role ? ROLE_LABELS[record.role] : '—'}`,
    record.telegram_username ? `*Telegram:* @${record.telegram_username}` : '',
    '',
    '_Пока заявка не принята, человек не видит заказы._',
  ].filter(Boolean).join('\n')
}

/**
 * Строгий ли режим допуска.
 *
 * Пока в базе нет ни одного подтверждённого менеджера, работать с заказами
 * можно как раньше — по факту присутствия в рабочем чате. Иначе первый же
 * выкат заблокировал бы владельца: он ещё не успел подать заявку сам себе.
 *
 * Как только появляется хотя бы один подтверждённый менеджер, включается
 * строгая проверка: кнопки работают только у тех, кто есть в `staff`.
 */
export function isStrictMode(approvedManagers: number): boolean {
  return approvedManagers > 0
}

export function canManageOrders(
  record: StaffRecord | null,
  strict: boolean,
): boolean {
  if (!strict)
    return true
  if (!record || record.status !== 'approved')
    return false
  return record.role === 'manager' || record.role === 'owner'
}


/**
 * Может ли человек управлять командой: принимать заявки и смотреть список.
 *
 * Только владелец. Менеджер ведёт заказы, но решать, кого пускать в систему,
 * — это другое право. До появления первого владельца работает прежнее
 * правило: решает любой из рабочего чата, иначе первую заявку принять было
 * бы некому.
 */
export function canManageStaff(record: StaffRecord | null, ownersExist: boolean): boolean {
  if (!ownersExist)
    return true
  return record?.status === 'approved' && record.role === 'owner'
}

/** Строка сотрудника в списке команды. */
export function staffLine(record: StaffRecord): string {
  const status = {
    approved: '✅',
    pending: '⏳',
    rejected: '❌',
    draft: '✏️',
  }[record.status] ?? '•'

  const role = record.role ? ROLE_LABELS[record.role] : 'роль не выбрана'
  const nick = record.telegram_username ? ` @${record.telegram_username}` : ''
  const phone = record.phone ? ` · ${record.phone}` : ''

  return `${status} *${record.full_name ?? 'без имени'}* — ${role}${nick}${phone}`
}

export function staffListMessage(records: StaffRecord[]): string {
  if (records.length === 0)
    return '*Команда*\n\nПока никого. Люди подают заявки командой /job в личке бота.'

  const byStatus = (s: StaffStatus) => records.filter(r => r.status === s)
  const parts = ['*Команда*', '']

  const pending = byStatus('pending')
  if (pending.length > 0) {
    parts.push('*Ждут решения:*', ...pending.map(staffLine), '')
  }

  const approved = byStatus('approved')
  if (approved.length > 0) {
    parts.push('*В команде:*', ...approved.map(staffLine), '')
  }

  const rejected = byStatus('rejected')
  if (rejected.length > 0)
    parts.push(`_Отклонённых: ${rejected.length}_`)

  return parts.join('\n').trim()
}
