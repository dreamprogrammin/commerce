/**
 * Бонусы активируются и у заказа, который в пути (`shipped`).
 *
 * До миграции 20260903090000 выборка активации шла по
 * `status IN ('confirmed','delivered')`, и заказ, переданный курьеру, в неё
 * не попадал: дата созревания наступала, а бонусы висели в отложенных, пока
 * оператор не отметит доставку. На проде так простоял один заказ — 100
 * бонусов с 29 мая 2026.
 *
 * Стенд — локальная база. `node check-bonus-shipped.mjs`
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

await service.from('bonus_transactions').delete().eq('order_id', ORDER).eq('transaction_type', 'activation')
const { data: order } = await service.from('orders').select('bonuses_awarded').eq('id', ORDER).single()
const award = order.bonuses_awarded

await fetch(`${SUPA}/auth/v1/admin/users/${USER_ID}`, {
  method: 'PUT',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
const asUser = createClient(SUPA, ANON)
const { error } = await asUser.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error) throw new Error(error.message)

async function run(status) {
  await service.from('bonus_transactions').delete().eq('order_id', ORDER).eq('transaction_type', 'activation')
  await service.from('orders').update({ status }).eq('id', ORDER)
  await service.from('profiles').update({ active_bonus_balance: 0, pending_bonus_balance: award }).eq('id', USER_ID)

  await asUser.rpc('activate_my_pending_bonuses')

  const [{ data: o }, { data: p }] = await Promise.all([
    service.from('orders').select('status').eq('id', ORDER).single(),
    service.from('profiles').select('active_bonus_balance, pending_bonus_balance').eq('id', USER_ID).single(),
  ])
  return { status: o.status, active: p.active_bonus_balance, pending: p.pending_bonus_balance }
}

console.log(`заказ даёт ${award} бонусов\n`)
let failed = false
// Заказ, ещё не подтверждённый оператором, бонусов давать не должен —
// это не дыра, а намеренная граница.
for (const [status, shouldActivate] of [
  ['new', false],
  ['processing', false],
  ['confirmed', true],
  ['shipped', true],
  ['delivered', true],
  ['completed', true],
  ['cancelled', false],
]) {
  const r = await run(status)
  const activated = r.active === award
  const ok = activated === shouldActivate && r.status === status
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${status.padEnd(10)} бонусы ${activated ? 'начислены' : 'ждут'}, ожидалось ${shouldActivate ? 'начислить' : 'ждать'} | статус остался «${r.status}»`)
}

await service.from('bonus_transactions').delete().eq('order_id', ORDER).eq('transaction_type', 'activation')
await service.from('orders').update({ status: 'shipped' }).eq('id', ORDER)
await service.from('profiles').update({ active_bonus_balance: 40, pending_bonus_balance: 0 }).eq('id', USER_ID)
if (failed)
  process.exitCode = 1
