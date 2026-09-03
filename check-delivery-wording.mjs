/**
 * Формулировки шага «заказ уехал со склада» зависят от способа доставки.
 *
 * На проде 42 заказа из 45 — самовывоз, а текст был написан только под
 * курьера: покупатель получал «заказ уже едет к вам» и никуда не ехал сам.
 *   node check-delivery-wording.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const SECRET = 'local-test-secret'
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'

const service = createClient(SUPA, SERVICE)

/*
 * Уведомление покупателю уходит только если у него привязан Telegram —
 * иначе проверять было бы нечего: в первом прогоне заказ был без привязки,
 * и строка «покупателю» выходила пустой.
 */
const { data: order } = await service.from('orders').select('user_id').eq('id', 'd7a7ed7f-94dc-4895-8838-90562bf973cb').single()
await service.from('profiles').update({ telegram_chat_id: '424242' }).eq('id', order.user_id)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

async function ship(method) {
  await service.from('orders').update({
    status: 'confirmed', delivery_method: method, telegram_message_id: '555',
  }).eq('id', ORDER)
  const before = calls().length
  const res = await fetch(
    `${SUPA}/functions/v1/ship-order?order_id=${ORDER}&table=orders&secret=${SECRET}`,
  )
  const text = await res.text()
  await new Promise(r => setTimeout(r, 1200))
  return { text, calls: calls().slice(before) }
}

// ── самовывоз ─────────────────────────────────────────────────────────────
const pickup = await ship('pickup')
check(pickup.text.includes('ГОТОВ К ВЫДАЧЕ'), `менеджеру: «${pickup.text.split('\n')[0]}»`)
check(!pickup.text.includes('КУРЬЕР'), 'про курьера в самовывозе не сказано')

const pickupNote = pickup.calls.map(c => JSON.stringify(c.body ?? {})).join(' ')
check(pickupNote.includes('готов к выдаче') || pickupNote.includes('Заказ готов'),
  'покупателю: сказано, что заказ готов к выдаче, а не «едет к вам»')
check(pickupNote.includes('Шапагат'), 'покупателю назван адрес пункта выдачи')
check(!pickupNote.includes('едет к вам'), 'про «едет к вам» при самовывозе не сказано')

// ── курьер ────────────────────────────────────────────────────────────────
const courier = await ship('courier')
check(courier.text.includes('ПЕРЕДАН КУРЬЕРУ'), `менеджеру: «${courier.text.split('\n')[0]}»`)
const courierNote = courier.calls.map(c => JSON.stringify(c.body ?? {})).join(' ')
check(courierNote.includes('едет к вам'), 'покупателю при курьере: заказ едет к нему')

// ── кнопки в карточке ─────────────────────────────────────────────────────
const { buildOrderKeyboard } = await import('./supabase/functions/_shared/orderActions.ts')
  .catch(() => ({ buildOrderKeyboard: null }))
if (buildOrderKeyboard) {
  const forPickup = buildOrderKeyboard('confirmed', 'orders', ORDER, 'pickup').inline_keyboard[0][0].text
  const forCourier = buildOrderKeyboard('confirmed', 'orders', ORDER, 'courier').inline_keyboard[0][0].text
  check(forPickup === '📦 Готов к выдаче', `кнопка при самовывозе: «${forPickup}»`)
  check(forCourier === '🚚 Передать курьеру', `кнопка при курьере: «${forCourier}»`)
}

// ── старые ссылки с секретом больше не возвращаются в чат ─────────────────
const anySecret = [...pickup.calls, ...courier.calls]
  .some(c => JSON.stringify(c.body ?? {}).includes(SECRET))
check(!anySecret, 'секрет в сообщения чата не попадает')

// ── последний шаг: «выдан» вместо «доставлен» при самовывозе ──────────────
async function deliver(method) {
  await service.from('orders').update({ status: 'shipped', delivery_method: method }).eq('id', ORDER)
  const res = await fetch(`${SUPA}/functions/v1/deliver-order?order_id=${ORDER}&table=orders&secret=${SECRET}`)
  return await res.text()
}

const gotPickup = await deliver('pickup')
check(gotPickup.includes('ВЫДАН'), `самовывоз: «${gotPickup.split('\n')[0]}»`)
const gotCourier = await deliver('courier')
check(gotCourier.includes('ДОСТАВЛЕН'), `курьер: «${gotCourier.split('\n')[0]}»`)

await service.from('orders').update({
  status: 'new', delivery_method: 'courier', telegram_message_id: null,
}).eq('id', ORDER)
await service.from('profiles').update({ telegram_chat_id: null }).eq('id', order.user_id)
if (failed) process.exitCode = 1
