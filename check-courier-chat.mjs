/**
 * Курьерский чат: адрес, время, телефон, сумма — и кнопка «Доставил».
 *
 * Владелец выбрал такой состав: курьеру не нужны ни отмены, ни бонусы, ни
 * чужие заказы. Проверяется и то, что из курьерского чата нельзя сделать
 * ничего, кроме отметки о доставке.
 *   node check-courier-chat.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const COURIER_CHAT = -1009876543210
const SECRET = 'local-test-secret'
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

async function ship(method) {
  await service.from('orders').update({
    status: 'confirmed', delivery_method: method,
    delivery_address: { city: 'Алматы', line1: 'ул. Абая 10, кв. 5' },
    delivery_date: '2026-09-04', delivery_slot: '14:00–18:00',
    customer_phone: '+7 701 555 44 33', payment_method: 'cash',
  }).eq('id', ORDER)
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/ship-order?order_id=${ORDER}&table=orders&secret=${SECRET}`)
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

// ── курьерский заказ уходит в курьерский чат ──────────────────────────────
const courier = await ship('courier')
const toCourier = courier.find(c => String(c.body?.chat_id) === String(COURIER_CHAT))
check(!!toCourier, 'курьерский заказ попадает в курьерский чат')
const text = toCourier?.body?.text ?? ''
check(text.includes('ул. Абая 10'), 'в сообщении адрес')
check(text.includes('14:00'), 'в сообщении время доставки')
check(text.includes('+7 701 555 44 33'), 'в сообщении телефон покупателя')
check(text.includes('к оплате'), 'в сообщении сумма к оплате')
check(!text.includes('бонус') && !text.includes('Состав'), 'лишнего курьеру не показываем')
check(
  (toCourier?.body?.reply_markup?.inline_keyboard ?? []).flat().some(b => b.text === '✅ Доставил'),
  'есть кнопка «Доставил»',
)
console.log(`\n--- что видит курьер ---\n${text}\n`)

// ── самовывоз в курьерский чат не идёт ────────────────────────────────────
const pickup = await ship('pickup')
check(!pickup.some(c => String(c.body?.chat_id) === String(COURIER_CHAT)),
  'самовывоз курьеру не отправляется')

// ── из курьерского чата можно только отметить доставку ────────────────────
async function tap(data) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: String(Date.now()), data,
        from: { id: 777001, first_name: 'Данияр' },
        message: { message_id: 9, chat: { id: COURIER_CHAT } },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1400))
  return calls().slice(before)
}

await service.from('orders').update({ status: 'shipped', delivery_method: 'courier' }).eq('id', ORDER)
const cancelTry = await tap(`cnl:o:${ORDER}`)
const { data: afterCancel } = await service.from('orders').select('status').eq('id', ORDER).single()
check(afterCancel.status === 'shipped', 'из курьерского чата нельзя отменить заказ')
const alert = cancelTry.find(c => c.method === 'answerCallbackQuery')
check(alert?.body?.text?.includes('только отметить доставку'), `курьеру объяснили: «${alert?.body?.text ?? '—'}»`)

await tap(`dlv:o:${ORDER}`)
const { data: afterDeliver } = await service.from('orders').select('status').eq('id', ORDER).single()
check(afterDeliver.status === 'delivered', `курьер отмечает доставку (статус «${afterDeliver.status}»)`)

await service.from('orders').update({
  status: 'new', delivery_method: 'courier', telegram_message_id: null,
}).eq('id', ORDER)
if (failed) process.exitCode = 1
