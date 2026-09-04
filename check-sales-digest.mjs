/**
 * Сводка по продажам: команда, кнопка, план, расписание.
 *
 * Владелец: «нужно, чтобы бот давал мотивации на продажи — CR, UPT,
 * товарооборот, план, сравнение продаж, процент выполнения; дважды в день,
 * в 9 утра и в 22».
 *   node check-sales-digest.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const SECRET = 'local-test-secret'
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777501, first_name: 'Айгуль', username: 'aigul_m' }
const MARK = 'sales-test@uhti.kz'

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

const hoursAgo = h => new Date(Date.now() - h * 36e5).toISOString()

// ── люди ──────────────────────────────────────────────────────────────────
await service.from('staff').delete().in('telegram_user_id', [OWNER.id, MANAGER.id])
await service.from('staff').insert([
  { telegram_user_id: OWNER.id, full_name: 'Малик Бабазов', role: 'owner', status: 'approved' },
  { telegram_user_id: MANAGER.id, full_name: 'Айгуль Смагулова', role: 'manager', status: 'approved' },
])

// ── заказы: сегодня, вчера, неделю назад ──────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
const base = {
  guest_email: MARK, guest_phone: '+77010000000', guest_name: 'Тестовый Гость',
  delivery_method: 'courier',
}
const { data: made } = await service.from('guest_checkouts').insert([
  { ...base, total_amount: 5000, final_amount: 5000, status: 'new', created_at: hoursAgo(2) },
  { ...base, total_amount: 15000, final_amount: 15000, status: 'confirmed', created_at: hoursAgo(3) },
  { ...base, total_amount: 9000, final_amount: 9000, status: 'cancelled', created_at: hoursAgo(4) },
  { ...base, total_amount: 12000, final_amount: 12000, status: 'delivered', created_at: hoursAgo(26) },
]).select('id, created_at')

// позиции: два товара сегодня, чтобы «штук в заказе» было чем считать
const { data: product } = await service.from('products').select('id').limit(1).single()
if (made?.length && product) {
  await service.from('guest_checkout_items').insert([
    { checkout_id: made[0].id, product_id: product.id, quantity: 2, price_per_item: 2500 },
    { checkout_id: made[1].id, product_id: product.id, quantity: 3, price_per_item: 5000 },
  ])
}

async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 7, text, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' }, from },
    }),
  })
  await new Promise(r => setTimeout(r, 1800))
  return calls().slice(before)
}

const said = cs => cs.filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')

// ── план ставится командой ────────────────────────────────────────────────
await service.from('sales_plans').delete().neq('month', '1900-01-01')
const noPlan = await say('/plan', OWNER, OWNER.id)
check(said(noPlan).includes('не задан'), `без плана: «${said(noPlan).split('\n')[0]}»`)

const setPlan = await say('/plan 3 000 000', OWNER, OWNER.id)
check(said(setPlan).includes('3 000 000'), `план принят: «${said(setPlan).split('\n')[0]}»`)
const { data: planRow } = await service.from('sales_plans').select('amount, updated_by').limit(1).single()
check(Number(planRow?.amount) === 3000000 && String(planRow?.updated_by) === String(OWNER.id),
  `план записан в базу: ${planRow?.amount} от ${planRow?.updated_by}`)

// ── сводка по команде ─────────────────────────────────────────────────────
const digest = await say('/sales', OWNER, OWNER.id)
const text = said(digest)
console.log(`\n--- сводка ---\n${text}\n`)

check(/План на день|Итог дня/.test(text), 'заголовок сводки на месте')
check(/\*Сегодня:\*\s*\d+ заказ/.test(text), 'есть сегодняшние заказы')
check(text.includes('Средний чек'), 'есть средний чек')
check(text.includes('штук в заказе'), 'есть штук в заказе (UPT)')
check(text.includes('Отменено: 1'), 'отменённый заказ посчитан отдельно')
check(text.includes('Вчера:'), 'есть сравнение со вчера')
check(text.includes('Тот же день неделю назад'), 'и с тем же днём недели')
check(text.includes('*План месяца:* 3 000 000 ₸'), 'план в сводке')
check(/выполнено \*\d+%\*/.test(text), 'процент выполнения')
check(text.includes('Норма дня'), 'дневная норма')
check(/Идём с опережением|Отставание/.test(text), 'видно опережение или отставание')
check(!text.includes('Конверсия'), 'конверсии нет, пока GA4 не настроен — и это честно')

// ── кнопка «Продажи» в рабочем чате ───────────────────────────────────────
const button = await say('📈 Продажи', OWNER, CHAT)
check(/План на день|Итог дня/.test(said(button)), 'кнопка «Продажи» в рабочем чате даёт ту же сводку')

// ── менеджеру нельзя ──────────────────────────────────────────────────────
const denied = await say('/sales', MANAGER, MANAGER.id)
check(said(denied).includes('доступна владельцу'), `менеджеру: «${said(denied).split('\n')[0]}»`)
const deniedPlan = await say('/plan 100', MANAGER, MANAGER.id)
check(said(deniedPlan).includes('ставит владелец'), 'и план он не поставит')
const { data: planAfter } = await service.from('sales_plans').select('amount').limit(1).single()
check(Number(planAfter?.amount) === 3000000, 'план от менеджера не изменился')

// ── расписание: функция sales-digest ──────────────────────────────────────
const before = calls().length
const auto = await fetch(`${SUPA}/functions/v1/sales-digest?secret=${SECRET}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slot: 'evening' }),
})
const body = await auto.json()
await new Promise(r => setTimeout(r, 1500))
const sentTo = calls().slice(before).find(c => c.method === 'sendMessage' && String(c.body?.chat_id) === String(OWNER.id))
check(body.sent === 1, `вечерняя сводка ушла владельцу (sent: ${body.sent})`)
check(sentTo?.body?.text?.includes('Итог дня'), 'и это именно вечерний вариант')
check(!calls().slice(before).some(c => String(c.body?.chat_id) === String(MANAGER.id)), 'менеджеру сводка не идёт')

const naked = await fetch(`${SUPA}/functions/v1/sales-digest`, { method: 'POST' })
check(naked.status === 403, `без секрета и не от расписания: ${naked.status}`)

// ── уборка ────────────────────────────────────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
await service.from('staff').delete().eq('telegram_user_id', MANAGER.id)
if (failed) process.exitCode = 1
