/**
 * Номер заказа — цифрами.
 *
 * Владелец: «номер заказа сделать цифры только без букв, а то тяжело
 * считывать». Был хвост UUID — «50B61F», «f973cb».
 *   node check-order-number.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MARK = 'number-test@uhti.kz'

const service = createClient(SUPA, SERVICE)
const anon = createClient(SUPA, ANON)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await service.from('staff').upsert({
  telegram_user_id: OWNER.id, full_name: 'Малик Бабазов', role: 'owner', status: 'approved',
}, { onConflict: 'telegram_user_id' })

// ── новый заказ получает номер ────────────────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
const { data: first } = await service.from('guest_checkouts').insert({
  guest_email: MARK, guest_phone: '+77015554433', guest_name: 'Гульмира',
  total_amount: 5000, final_amount: 5000, delivery_method: 'courier', status: 'new',
}).select('id, order_number').single()

check(Number.isInteger(first?.order_number), `номер проставился сам: ${first?.order_number}`)
check(/^\d+$/.test(String(first?.order_number)), 'в номере только цифры, букв нет')
check(Number(first?.order_number) >= 1000, 'номер начинается с четырёхзначного — выглядит как номер')

const { data: second } = await service.from('guest_checkouts').insert({
  guest_email: MARK, guest_phone: '+77015554433', guest_name: 'Гульмира',
  total_amount: 7000, final_amount: 7000, delivery_method: 'courier', status: 'new',
}).select('id, order_number').single()
check(Number(second.order_number) === Number(first.order_number) + 1,
  `следующий заказ получает следующий номер: ${first.order_number} → ${second.order_number}`)

// ── номера не пересекаются между таблицами ────────────────────────────────
const { data: userOrders } = await service.from('orders').select('order_number')
const { data: guestOrders } = await service.from('guest_checkouts').select('order_number')
const all = [...userOrders, ...guestOrders].map(o => o.order_number)
check(new Set(all).size === all.length, `номера уникальны по обеим таблицам (${all.length} заказов)`)

// ── номер виден покупателю без чтения заказа ──────────────────────────────
const { data: byRpc } = await anon.rpc('order_number_by_id', { p_order_id: first.id })
check(Number(byRpc) === Number(first.order_number),
  `гость узнаёт номер по id заказа: ${byRpc}`)

const { data: guestRead } = await anon.from('guest_checkouts').select('id').eq('id', first.id)
check((guestRead ?? []).length === 0, 'при этом сам заказ гостю по-прежнему не отдаётся')

// ── бот: поиск по цифровому номеру ────────────────────────────────────────
async function say(text) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 5, text, chat: { id: CHAT, type: 'group' }, from: OWNER },
    }),
  })
  await new Promise(r => setTimeout(r, 1700))
  return calls().slice(before).filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')
}

const found = await say(`/order ${first.order_number}`)
check(found.includes(String(first.order_number)), `бот находит заказ по цифровому номеру: «${found.split('\n')[0]}»`)

const oldStyle = await say(`/order ${first.id.slice(-6)}`)
check(oldStyle.includes(String(first.order_number)),
  'и по старому шестизначному хвосту id — старые бумажки продолжают работать')

const missing = await say('/order 999999')
check(missing.includes('не найден'), `по чужому номеру: «${missing.split('\n')[0]}»`)

// ── номер в сообщении покупателю ──────────────────────────────────────────
await service.from('guest_checkouts').update({ telegram_chat_id: 909101 }).eq('id', first.id)
const before = calls().length
await service.from('guest_checkouts').update({ status: 'confirmed' }).eq('id', first.id)
await new Promise(r => setTimeout(r, 2500))
const toBuyer = calls().slice(before).find(c => c.method === 'sendMessage' && String(c.body?.chat_id) === '909101')
check(toBuyer?.body?.text?.includes(String(first.order_number)),
  `покупателю приходит цифровой номер: «${(toBuyer?.body?.text ?? '—').split('\n').slice(0, 2).join(' ')}»`)
check(!/[a-f]{4}/i.test(toBuyer?.body?.text ?? ''), 'и никаких шестнадцатеричных хвостов в тексте')

await service.from('guest_checkouts').delete().eq('guest_email', MARK)
if (failed) process.exitCode = 1
