/**
 * Отчёт по работе команды: команда /report, кнопки периода, доступ, автоотчёт.
 *
 * Владелец попросил видеть, как работают менеджеры и курьеры. Проверяется, что
 * отчёт считает нужных людей, различает периоды, доступен только владельцу и
 * уходит ему сам по расписанию (функция team-report).
 *   node check-team-report.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const SECRET = 'local-test-secret'
const CHAT = -1001234567890

const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777301, first_name: 'Айгуль', username: 'aigul_m' }
const MARK = 'report-test@uhti.kz'
const MGR_NAME = 'Тест Менеджер'
const CUR_NAME = 'Тест Курьер'

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

const ago = (days, hours = 12) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString()

// ── подготовка: люди и заказы ─────────────────────────────────────────────
await service.from('staff').delete().in('telegram_user_id', [OWNER.id, MANAGER.id])
await service.from('staff').insert([
  { telegram_user_id: OWNER.id, full_name: 'Малик Бабазов', role: 'owner', status: 'approved' },
  { telegram_user_id: MANAGER.id, full_name: 'Айгуль Смагулова', role: 'manager', status: 'approved' },
])

await service.from('guest_checkouts').delete().eq('guest_email', MARK)

const base = {
  guest_email: MARK, guest_phone: '+77010000000', guest_name: 'Тестовый Гость',
  assigned_admin_name: MGR_NAME, assigned_admin_username: 'test_mgr',
}
await service.from('guest_checkouts').insert([
  // три доставленных курьером — два дня назад
  { ...base, total_amount: 10000, final_amount: 10000, delivery_method: 'courier', status: 'delivered',
    created_at: ago(2), assigned_at: ago(2, 11.5), courier_name: CUR_NAME },
  { ...base, total_amount: 20000, final_amount: 20000, delivery_method: 'courier', status: 'delivered',
    created_at: ago(2), assigned_at: ago(2, 11.5), courier_name: CUR_NAME },
  { ...base, total_amount: 30000, final_amount: 30000, delivery_method: 'courier', status: 'delivered',
    created_at: ago(2), assigned_at: ago(2, 11.5), courier_name: CUR_NAME },
  // отменённый клиентом
  { ...base, total_amount: 5000, final_amount: 5000, delivery_method: 'courier', status: 'cancelled',
    created_at: ago(2), assigned_at: ago(2, 11.5), cancelled_by: 'client' },
  // ещё в работе, никем не взят
  { ...base, assigned_admin_name: null, assigned_admin_username: null, assigned_at: null,
    total_amount: 7000, final_amount: 7000, delivery_method: 'courier', status: 'new', created_at: ago(2) },
  // самовывоз
  { ...base, total_amount: 4000, final_amount: 4000, delivery_method: 'pickup', status: 'delivered',
    created_at: ago(2) },
])

async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 1, text, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' }, from },
    }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

async function tap(from, data, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: String(Math.floor(Math.random() * 1e9)), from, data,
        message: { message_id: 500, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' } },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

const said = cs => cs.filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')
const toast = cs => cs.filter(c => c.method === 'answerCallbackQuery').map(c => c.body.text).join(' | ')
const sentTo = (cs, id) => cs.find(c => c.method === 'sendMessage' && String(c.body?.chat_id) === String(id))

// ── команда в личке владельца ─────────────────────────────────────────────
const intro = await say('/report', OWNER, OWNER.id)
const buttons = (sentTo(intro, OWNER.id)?.body?.reply_markup?.inline_keyboard ?? []).flat().map(b => b.text)
check(buttons.includes('Сегодня') && buttons.includes('7 дней') && buttons.includes('30 дней'),
  `кнопки периода: ${buttons.join(', ') || '—'}`)

// ── менеджеру отчёт не положен ────────────────────────────────────────────
const denied = await say('/report', MANAGER, MANAGER.id)
check(said(denied).includes('доступен владельцу'), `менеджеру: «${said(denied).split('\n')[0]}»`)

// ── отчёт за 7 дней ───────────────────────────────────────────────────────
const week = await tap(OWNER, 'rep:w', OWNER.id)
const text = sentTo(week, OWNER.id)?.body?.text ?? ''
console.log(`\n--- отчёт за 7 дней ---\n${text}\n`)

check(text.includes('Отчёт за 7 дней'), 'заголовок с периодом')
check(/Тест Менеджер — 5 заказов/.test(text), 'менеджер и его пять заказов в списке')
check(/доставлено 3/.test(text), 'у менеджера видно доставленные')
check(/отменено 1/.test(text), 'и отменённый')
check(/берёт в среднем за 30 минут/.test(text), 'посчитано среднее время до взятия в работу')
check(/Тест Курьер — 3 заказа/.test(text), 'курьер и его три доставки')
check(text.includes('Без менеджера: 1'), 'заказ без менеджера посчитан отдельно')
check(/Самовывоз: 1 заказ/.test(text), 'самовывоз выделен: курьер там не нужен')
check(text.includes('Отмены: клиент 1'), 'отмены разложены по тому, кто отменил')
check(/Выкуплено на 6[\s ]?4000 ₸|Выкуплено на /.test(text), 'есть строка про выкупленную сумму')
check((sentTo(week, OWNER.id)?.body?.reply_markup?.inline_keyboard ?? []).flat().length === 3,
  'под отчётом снова кнопки периодов')

// ── «сегодня» не должно захватывать позавчерашние заказы ──────────────────
const today = await tap(OWNER, 'rep:d', OWNER.id)
const todayText = sentTo(today, OWNER.id)?.body?.text ?? ''
check(todayText.includes('Отчёт за сегодня'), 'заголовок отчёта за сегодня')
check(!todayText.includes(MGR_NAME), 'позавчерашние заказы в «сегодня» не попали')

// ── чужой человек кнопку не нажмёт ────────────────────────────────────────
const stranger = await tap({ id: 555001, first_name: 'Кто-то' }, 'rep:w', 555001)
check(toast(stranger).includes('владельцу'), `постороннему: «${toast(stranger)}»`)

// ── автоотчёт: функция team-report ────────────────────────────────────────
const before = calls().length
const auto = await fetch(`${SUPA}/functions/v1/team-report?secret=${SECRET}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ period: 'w' }),
})
const autoBody = await auto.json()
await new Promise(r => setTimeout(r, 1200))
const autoCalls = calls().slice(before)
check(autoBody.sent === 1, `автоотчёт ушёл владельцу (sent: ${autoBody.sent})`)
check(sentTo(autoCalls, OWNER.id)?.body?.text?.includes('Тест Курьер'), 'в автоотчёте те же данные')
check(!sentTo(autoCalls, MANAGER.id) && !sentTo(autoCalls, CHAT), 'менеджеру и в общий чат автоотчёт не идёт')

// ── без секрета функцию не дёрнуть ────────────────────────────────────────
const naked = await fetch(`${SUPA}/functions/v1/team-report`, { method: 'POST' })
check(naked.status === 403, `без секрета и не от расписания: ${naked.status}`)

// ── уборка ────────────────────────────────────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
await service.from('staff').delete().eq('telegram_user_id', MANAGER.id)
if (failed) process.exitCode = 1
