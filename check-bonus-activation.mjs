/**
 * Активация бонусов не трогает статус заказа и не начисляет дважды.
 *
 * Проверяет ровно то, что чинила миграция
 * 20260902120000_bonus_activation_keeps_order_status.sql:
 *  1) заказ, у которого созрели бонусы, остаётся в своём статусе;
 *  2) бонусы начисляются один раз, сколько ни зови;
 *  3) откат статуса заказа больше не даёт повторного начисления —
 *     именно так на локальной базе получилось 10 начислений вместо одного.
 *
 * Стенд — локальная база. `node check-bonus-activation.mjs`
 */
import { createClient } from '@supabase/supabase-js'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const USER_ID = '653f339a-250a-4e52-ba86-6adcaf6fbfa5'
const EMAIL = 'test@uhti.local'
const PASSWORD = 'ProbaPassword123!'
const ORDER = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

const service = createClient(SUPA, SERVICE)

// чистый лист: убираем прежние активации по этому заказу
await service.from('bonus_transactions').delete().eq('order_id', ORDER).eq('transaction_type', 'activation')
await service.from('orders').update({ status: 'confirmed' }).eq('id', ORDER)
const { data: order } = await service.from('orders').select('bonuses_awarded').eq('id', ORDER).single()
const award = order.bonuses_awarded
await service.from('profiles').update({ active_bonus_balance: 0, pending_bonus_balance: award }).eq('id', USER_ID)

await fetch(`${SUPA}/auth/v1/admin/users/${USER_ID}`, {
  method: 'PUT',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
const asUser = createClient(SUPA, ANON)
const { error } = await asUser.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error) throw new Error(error.message)

async function state() {
  const [{ data: o }, { data: p }, { count }] = await Promise.all([
    service.from('orders').select('status').eq('id', ORDER).single(),
    service.from('profiles').select('active_bonus_balance, pending_bonus_balance').eq('id', USER_ID).single(),
    service.from('bonus_transactions').select('id', { count: 'exact', head: true })
      .eq('order_id', ORDER).eq('transaction_type', 'activation'),
  ])
  return { status: o.status, active: p.active_bonus_balance, pending: p.pending_bonus_balance, activations: count }
}

console.log(`заказ даёт ${award} бонусов\n`)
console.log('до вызова:            ', JSON.stringify(await state()))

const { data: first } = await asUser.rpc('activate_my_pending_bonuses')
/*
 * Статус ЗАПОМИНАЕТСЯ ЗДЕСЬ, сразу после первого вызова, и проверяется именно
 * это значение. Итоговое состояние для проверки статуса не годится: ниже
 * сценарий сам двигает статус, и на старой (сломанной) функции проверка
 * получалась зелёной — подмену `confirmed` → `completed` затирал мой же
 * последний UPDATE. Поймано при обязательной проверке «тест обязан краснеть
 * без правки».
 */
const afterFirst = await state()
console.log('после 1-го вызова:    ', JSON.stringify(afterFirst), '| вернула:', JSON.stringify(first))

for (let i = 0; i < 4; i++) await asUser.rpc('activate_my_pending_bonuses')
console.log('после ещё 4 вызовов:  ', JSON.stringify(await state()))

// откат статуса оператором — то, что раньше давало повторное начисление
await service.from('orders').update({ status: 'delivered' }).eq('id', ORDER)
await asUser.rpc('activate_my_pending_bonuses')
await service.from('orders').update({ status: 'confirmed' }).eq('id', ORDER)
await asUser.rpc('activate_my_pending_bonuses')
console.log('после отката статуса: ', JSON.stringify(await state()))

const final = await state()
const statusKept = afterFirst.status === 'confirmed'
const onceOnly = final.activations === 1 && final.active === award
console.log(`\n${statusKept ? '✅' : '❌'} статус после начисления: «${afterFirst.status}» (ожидается confirmed — активация не должна его трогать)`)
console.log(`${onceOnly ? '✅' : '❌'} начислений ${final.activations}, активных бонусов ${final.active} из ${award}`)
if (!statusKept || !onceOnly)
  process.exitCode = 1

// возвращаем стенд в исходное
await service.from('orders').update({ status: 'shipped' }).eq('id', ORDER)
