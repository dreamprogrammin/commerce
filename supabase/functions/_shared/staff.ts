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
export type StaffStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'fired'

export interface StaffRecord {
  id: string
  telegram_user_id: number
  telegram_username: string | null
  full_name: string | null
  phone: string | null
  role: StaffRole | null
  status: StaffStatus
  /**
   * Когда человека уволили в последний раз. Доступ определяется только
   * статусом — эта дата нужна, чтобы при повторной заявке владелец видел, что
   * с этим человеком уже расставались.
   */
  fired_at?: string | null
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
  kind: 'role' | 'approve' | 'reject' | 'fire' | 'fireConfirm' | 'fireCancel'
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

  // Увольнение в два нажатия: `rm` — спросить, `rmok` — подтвердить.
  if (parts[1] === 'rm' && parts[2])
    return { kind: 'fire', staffId: parts[2] }

  if (parts[1] === 'rmok' && parts[2])
    return { kind: 'fireConfirm', staffId: parts[2] }

  if (parts[1] === 'rmno')
    return { kind: 'fireCancel' }

  return null
}

/** Дата по Алматы (UTC+5) в виде `15.09.2026`. Пустая строка, если даты нет. */
function almatyDate(iso: string | null | undefined): string {
  const parsed = iso ? new Date(iso) : null
  if (!parsed || Number.isNaN(parsed.getTime()))
    return ''

  const shifted = new Date(parsed.getTime() + 5 * 60 * 60000)
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${shifted.getUTCFullYear()}`
}

/** Заявка в том виде, в каком она уходит владельцу. */
export function applicationMessage(record: StaffRecord): string {
  /*
   * Уволенный может подать заявку заново — бот его не помнит, а владелец
   * помнит не всегда. Про прошлое увольнение говорим прямо: это ровно та
   * подробность, ради которой заявку и рассматривают.
   */
  const fired = almatyDate(record.fired_at)

  return [
    '*Новая заявка на работу*',
    '',
    `*Имя:* ${record.full_name ?? '—'}`,
    `*Телефон:* ${record.phone ?? '—'}`,
    `*Роль:* ${record.role ? ROLE_LABELS[record.role] : '—'}`,
    record.telegram_username ? `*Telegram:* @${record.telegram_username}` : '',
    record.fired_at ? `⚠️ Этого человека уже увольняли${fired ? ` — ${fired}` : ''}.` : '',
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

/**
 * Увольнение: можно ли этому человеку убрать из команды того.
 *
 * ЗАЧЕМ ОТДЕЛЬНОЕ ПРАВИЛО, А НЕ `canManageStaff`. Принимать заявки в мягком
 * режиме (пока владельца в базе нет) разрешено любому из рабочего чата — иначе
 * первую заявку принять было бы некому. Для увольнения такой поблажки нет:
 * отобрать доступ у работающего человека — не то действие, которое стоит
 * отдавать «кому-то из чата». Увольняет владелец, всегда.
 *
 * Причина отказа возвращается текстом: она уходит нажавшему всплывающей
 * плашкой, и «кнопка не сработала» без объяснения — худший из ответов.
 */
export type FireVerdict = { ok: true } | { ok: false, reason: string }

export function canFire(
  actor: StaffRecord | null,
  target: StaffRecord | null,
  approvedOwners: number,
): FireVerdict {
  if (!(actor?.status === 'approved' && actor.role === 'owner'))
    return { ok: false, reason: 'Увольняет владелец.' }

  if (!target)
    return { ok: false, reason: 'Такого сотрудника не нашёл.' }

  if (target.id === actor.id)
    return { ok: false, reason: 'Себя уволить нельзя.' }

  if (target.status === 'fired')
    return { ok: false, reason: 'Этот человек уже уволен.' }

  /*
   * Уволить можно только принятого. Заявку, которую ещё не рассмотрели,
   * отклоняют кнопкой под ней — это другое действие и другой ответ человеку.
   */
  if (target.status !== 'approved')
    return { ok: false, reason: 'Он не в команде: заявку отклоняют кнопкой под ней.' }

  /*
   * Последнего владельца не отдаём. Без единого владельца включается мягкий
   * режим, в котором заявки принимает любой из рабочего чата, — увольнение
   * обернулось бы раздачей прав вместо их отзыва.
   */
  if (target.role === 'owner' && approvedOwners <= 1)
    return { ok: false, reason: 'Это единственный владелец — принимать заявки станет некому.' }

  return { ok: true }
}

/**
 * Кнопки под списком команды: по кнопке на того, кого этот человек вправе
 * уволить. Правило одно и то же и здесь, и при нажатии — кнопки, которая
 * заведомо ответит отказом, в списке не появится.
 *
 * `null` вместо пустой клавиатуры: Telegram отвергает `inline_keyboard: []`.
 */
export function buildTeamKeyboard(records: StaffRecord[], actorStaffId: string | null) {
  const actor = records.find(r => r.id === actorStaffId) ?? null
  const owners = records.filter(r => r.status === 'approved' && r.role === 'owner').length

  const rows = records
    .filter(r => canFire(actor, r, owners).ok)
    // Десяти хватает: дальше кончается экран телефона, а команда столько и не
    // бывает. Тот же предел, что и в списке заказов.
    .slice(0, 10)
    .map(r => [{
      text: `🚪 Уволить · ${r.full_name ?? 'без имени'}`,
      callback_data: `job:rm:${r.id}`,
    }])

  return rows.length > 0 ? { inline_keyboard: rows } : null
}

/**
 * Подтверждение. Увольнение — единственное необратимое действие бота по
 * людям, и одного случайного нажатия в списке для него мало.
 */
export function buildFireConfirmKeyboard(staffId: string) {
  return {
    inline_keyboard: [[
      { text: '🚪 Да, уволить', callback_data: `job:rmok:${staffId}` },
      { text: '↩️ Отмена', callback_data: 'job:rmno' },
    ]],
  }
}

/**
 * Что показать перед увольнением. Незакрытые заказы называем числом: после
 * увольнения кнопки у человека отнимутся, и заказ повиснет, если его не
 * передать другому.
 */
export function fireConfirmText(record: StaffRecord, activeOrders: number): string {
  return [
    '*Уволить сотрудника?*',
    '',
    `*Имя:* ${record.full_name ?? '—'}`,
    `*Роль:* ${record.role ? ROLE_LABELS[record.role] : '—'}`,
    record.telegram_username ? `*Telegram:* @${record.telegram_username}` : '',
    '',
    activeOrders > 0
      ? `⚠️ На нём ещё ${activeOrders} ${orderWord(activeOrders)} — передайте другому.`
      : '',
    'Доступ к заказам закроется сразу.',
  ].filter(Boolean).join('\n')
}

/** «1 заказ», «2 заказа», «5 заказов» — иначе фраза читается как машинная. */
export function orderWord(count: number): string {
  const tail = count % 100
  if (tail >= 11 && tail <= 14)
    return 'заказов'

  return ({ 1: 'заказ', 2: 'заказа', 3: 'заказа', 4: 'заказа' })[count % 10] ?? 'заказов'
}

/** Чем заканчивается заявка на увольнение в рабочем чате. */
export function firedResultText(
  record: StaffRecord,
  byName: string,
  activeOrders: number,
): string {
  return [
    `🚪 *Уволен:* ${record.full_name ?? 'без имени'}`
    + `${record.role ? ` — ${ROLE_LABELS[record.role]}` : ''}`,
    `_Решение: ${byName}._`,
    activeOrders > 0
      ? `\n⚠️ За ним ещё ${activeOrders} ${orderWord(activeOrders)} — передайте другому через «📋 Активные заказы».`
      : '',
  ].filter(Boolean).join('\n')
}

/**
 * Что придёт самому человеку. Коротко и без упрёков: бот сообщает факт, а
 * разговор — дело владельца.
 */
export function firedNoticeText(): string {
  return 'Вы больше не в команде магазина — доступ к заказам закрыт.\n\nСпасибо за работу!'
}

/** Строка сотрудника в списке команды. */
export function staffLine(record: StaffRecord): string {
  const status = {
    approved: '✅',
    pending: '⏳',
    rejected: '❌',
    draft: '✏️',
    fired: '🚪',
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

  /*
   * Отклонённые и уволенные — счётчиками, а не списком: в команде их нет, а
   * место в сообщении занимают. Уволенные считаются отдельно: «отклонён» —
   * это тот, кого не взяли, и путать одно с другим владельцу незачем.
   */
  const rejected = byStatus('rejected')
  if (rejected.length > 0)
    parts.push(`_Отклонённых: ${rejected.length}_`)

  const fired = byStatus('fired')
  if (fired.length > 0)
    parts.push(`_Уволенных: ${fired.length}_`)

  return parts.join('\n').trim()
}
