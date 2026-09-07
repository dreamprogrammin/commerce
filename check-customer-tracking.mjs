/**
 * Уведомления покупателю: подписка на заказ в Telegram и статусы — в том числе
 * гостю, у которого нет ни аккаунта, ни другого канала.
 *
 * Владелец попросил проработать уведомления клиентам. Разбор показал: триггер
 * статуса отсекает гостевые заказы первой строкой (`user_id IS NULL`), SMS у
 * магазина нет, а Telegram привязан у двоих из десяти профилей.
 *   node check-customer-tracking.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const BUYER = { id: 909001, first_name: 'Гульмира' }
const MARK = 'tracking-test@uhti.kz'

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── гостевой заказ ────────────────────────────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
const { data: order } = await service.from('guest_checkouts').insert({
  guest_email: MARK, guest_phone: '+77015554433', guest_name: 'Гульмира',
  total_amount: 12000, final_amount: 12000, delivery_method: 'courier', status: 'new',
}).select('id, tracking_code, telegram_chat_id').single()

check(!!order?.tracking_code && order.tracking_code.length >= 12,
  `код отслеживания проставился сам: ${order?.tracking_code}`)
check(order?.telegram_chat_id === null, 'чат к заказу пока не привязан')

// ── кнопка со страницы заказа ведёт в бота ────────────────────────────────
const redirect = await fetch(`${SUPA}/functions/v1/track-order?order=${order.id}`, { redirect: 'manual' })
const target = redirect.headers.get('location') ?? ''
check(redirect.status === 302, `функция отвечает редиректом: ${redirect.status}`)
check(target.includes('t.me/') && target.includes(`start=t${order.tracking_code}`),
  `и ведёт в бота с кодом заказа: ${target}`)
check(!target.includes(order.id), 'id заказа в ссылку не попадает')

const bad = await fetch(`${SUPA}/functions/v1/track-order?order=00000000-0000-0000-0000-000000000000`, { redirect: 'manual' })
check((bad.headers.get('location') ?? '').includes('uhti.kz'),
  'по несуществующему заказу — обратно на сайт, а не в бота')

// ── покупатель нажал Start ────────────────────────────────────────────────
async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 11, text, chat: { id: chatId, type: 'private' }, from },
    }),
  })
  await new Promise(r => setTimeout(r, 1600))
  return calls().slice(before)
}

const started = await say(`/start t${order.tracking_code}`, BUYER, BUYER.id)
const reply = started.filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')
check(reply.includes('слежу за ним'), `бот подтвердил подписку: «${reply.split('\n')[0]}»`)
check(reply.includes('новый'), 'и сразу показал текущий статус')

const { data: linked } = await service.from('guest_checkouts').select('telegram_chat_id').eq('id', order.id).single()
check(String(linked.telegram_chat_id) === String(BUYER.id), `чат записан в заказ: ${linked.telegram_chat_id}`)

// ── статусы доходят покупателю ────────────────────────────────────────────
async function moveTo(status) {
  const before = calls().length
  await service.from('guest_checkouts').update({ status }).eq('id', order.id)
  await new Promise(r => setTimeout(r, 2500))
  return calls().slice(before).filter(c => c.method === 'sendMessage' && String(c.body?.chat_id) === String(BUYER.id))
}

const confirmed = await moveTo('confirmed')
check(confirmed.some(c => /подтверждён/i.test(c.body.text)), `«подтверждён» дошло: «${(confirmed[0]?.body?.text ?? '—').split('\n')[0]}»`)

const shipped = await moveTo('shipped')
check(shipped.some(c => /курьеру|выдаче/i.test(c.body.text)), `«в пути» дошло: «${(shipped[0]?.body?.text ?? '—').split('\n')[0]}»`)

const delivered = await moveTo('delivered')
check(delivered.some(c => /доставлен/i.test(c.body.text)), `«доставлен» дошло: «${(delivered[0]?.body?.text ?? '—').split('\n')[0]}»`)

// ── чужой код не подписывает ──────────────────────────────────────────────
const wrong = await say('/start tdeadbeefdead', BUYER, BUYER.id)
const wrongReply = wrong.filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')
check(wrongReply.includes('Не нашёл такой заказ'), `по чужому коду: «${wrongReply.split('\n')[0]}»`)

// ── обычное приветствие не сломалось ──────────────────────────────────────
const welcome = await say('/start', { id: 909002, first_name: 'Кто-то' }, 909002)
check(welcome.some(c => c.method === 'sendMessage' && /Ухтышка/.test(c.body.text)),
  'обычный /start по-прежнему показывает приветствие покупателю')

await service.from('guest_checkouts').delete().eq('guest_email', MARK)
if (failed) process.exitCode = 1
