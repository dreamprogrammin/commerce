/**
 * Доставки уходят курьерам в личку, а не в общий чат.
 *
 * Владелец заметил, что в общем курьерском чате каждый курьер видит чужие
 * адреса, телефоны и суммы. Теперь предложение рассылается всем принятым
 * курьерам лично, и кто первым нажал «Беру» — тот и везёт.
 *
 * Проверяется: состав предложения (без телефона), закрепление за первым,
 * гашение предложения у остальных, запрет отметить чужую доставку, а также
 * что после доставки и после отмены кнопки в личке гаснут.
 *   node check-courier-dm.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const ADMIN_CHAT = -1001234567890
const SECRET = 'local-test-secret'
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'

const DANIYAR = { id: 777101, first_name: 'Данияр', username: 'dan_k' }
const ASEL = { id: 777102, first_name: 'Асель', username: 'asel' }

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

async function couriers(list) {
  await service.from('staff').delete().in('telegram_user_id', [DANIYAR.id, ASEL.id])
  await service.from('courier_offers').delete().eq('order_id', ORDER)
  if (list.length)
    await service.from('staff').insert(list)
}

async function ship(method) {
  await service.from('orders').update({
    status: 'confirmed', delivery_method: method,
    delivery_address: { city: 'Алматы', line1: 'ул. Абая 10, кв. 5' },
    delivery_date: '2026-09-04', delivery_slot: '14:00–18:00',
    customer_phone: '+7 701 555 44 33', customer_name: 'Гульмира',
    payment_method: 'cash',
    courier_staff_id: null, courier_name: null, courier_taken_at: null,
  }).eq('id', ORDER)
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/ship-order?order_id=${ORDER}&table=orders&secret=${SECRET}`)
  await new Promise(r => setTimeout(r, 1800))
  return calls().slice(before)
}

async function press(from, data, messageId = 999) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: String(Math.floor(Math.random() * 1e9)), from, data,
        message: { message_id: messageId, chat: { id: from.id, type: 'private' } },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1800))
  return calls().slice(before)
}

/**
 * То же тело, что шлёт триггер `sync_order_status_to_telegram` (снято с прода
 * через pg_get_functiondef). Сам триггер локально дёргать нельзя: в его теле
 * зашит АДРЕС ПРОДА, и смена статуса в локальной базе уходит боевой функции.
 */
async function syncStatus(status) {
  await service.from('orders').update({ status }).eq('id', ORDER)
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/sync-order-status-to-telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'pg_net/0.14.0' },
    body: JSON.stringify({
      record: { id: ORDER, status, telegram_message_id: null },
      old_record: { status: 'shipped' },
      table: 'orders',
    }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

const toast = cs => cs.filter(c => c.method === 'answerCallbackQuery').map(c => c.body.text).join(' | ')
const sentTo = (cs, id) => cs.find(c => c.method === 'sendMessage' && String(c.body?.chat_id) === String(id))
const editedFor = (cs, id) => cs.find(c => c.method === 'editMessageText' && String(c.body?.chat_id) === String(id))

// ── рассылка предложения ──────────────────────────────────────────────────
await couriers([
  { telegram_user_id: DANIYAR.id, telegram_username: 'dan_k', full_name: 'Данияр Ким', phone: '+77011112233', role: 'courier', status: 'approved' },
  { telegram_user_id: ASEL.id, telegram_username: 'asel', full_name: 'Асель Нур', phone: '+77012223344', role: 'courier', status: 'approved' },
])

const shipped = await ship('courier')
const offer = sentTo(shipped, DANIYAR.id)
check(!!offer, 'предложение приходит первому курьеру в личку')
check(!!sentTo(shipped, ASEL.id), 'и второму курьеру тоже')
check(!shipped.some(c => c.method === 'sendMessage' && String(c.body?.chat_id) === String(ADMIN_CHAT)),
  'в рабочий чат при этом ничего лишнего не летит')

const text = offer?.body?.text ?? ''
check(text.includes('ул. Абая 10'), 'в предложении адрес')
check(text.includes('14:00'), 'в предложении время')
check(text.includes('к оплате'), 'в предложении сумма')
check(!text.includes('+7 701 555 44 33'), 'телефона покупателя в предложении НЕТ')
check(!text.includes('Гульмира'), 'имени покупателя в предложении тоже нет')
check((offer?.body?.reply_markup?.inline_keyboard ?? []).flat().some(b => b.text === '🚗 Беру'),
  'есть кнопка «Беру»')
console.log(`\n--- что видит курьер до «Беру» ---\n${text}\n`)

const { count: offersSaved } = await service
  .from('courier_offers').select('id', { count: 'exact', head: true }).eq('order_id', ORDER)
check(offersSaved === 2, `разосланные предложения записаны в базу (${offersSaved})`)

// ── самовывоз курьерам не идёт ────────────────────────────────────────────
const pickup = await ship('pickup')
check(!sentTo(pickup, DANIYAR.id) && !sentTo(pickup, ASEL.id), 'самовывоз курьерам не отправляется')

// ── первый нажавший забирает доставку ─────────────────────────────────────
await ship('courier')
const taken = await press(DANIYAR, `tak:o:${ORDER}`)
check(toast(taken).includes('за вами'), `нажавшему: «${toast(taken)}»`)

const { data: order } = await service.from('orders')
  .select('courier_name, courier_staff_id, courier_taken_at').eq('id', ORDER).single()
check(order.courier_name === 'Данияр Ким', `в заказе записан курьер: ${order.courier_name}`)
check(!!order.courier_staff_id && !!order.courier_taken_at, 'проставлены id курьера и время')

const mine = editedFor(taken, DANIYAR.id)
check(mine?.body?.text?.includes('+7 701 555 44 33'), 'взявшему приходит телефон покупателя')
check((mine?.body?.reply_markup?.inline_keyboard ?? []).flat().some(b => b.text === '✅ Доставил'),
  'и кнопка «Доставил»')

const other = editedFor(taken, ASEL.id)
check(other?.body?.text?.includes('взял Данияр Ким'), `у второго курьера: «${other?.body?.text ?? '—'}»`)
check(!other?.body?.text?.includes('Абая'), 'чужой адрес у второго курьера стёрт')
check(!other?.body?.reply_markup, 'и кнопки «Беру» у него больше нет')

const notice = sentTo(taken, ADMIN_CHAT)
check(notice?.body?.text?.includes('Данияр Ким'), `менеджерам в чат: «${notice?.body?.text ?? '—'}»`)

// ── второй опоздал ────────────────────────────────────────────────────────
const late = await press(ASEL, `tak:o:${ORDER}`)
check(toast(late).includes('уже взял'), `опоздавшему: «${toast(late)}»`)

// ── чужую доставку не отметить ────────────────────────────────────────────
const alien = await press(ASEL, `dlv:o:${ORDER}`)
check(toast(alien).includes('другой курьер'), `чужая доставка: «${toast(alien)}»`)

// ── свою — можно, и кнопка гаснет тут же ──────────────────────────────────
const closedByCourier = await press(DANIYAR, `dlv:o:${ORDER}`)
const { data: delivered } = await service.from('orders').select('status').eq('id', ORDER).single()
check(delivered.status === 'delivered', `свою доставку курьер закрывает (статус: ${delivered.status})`)

/*
 * Проверяем ответ на само нажатие, до всякого триггера: курьер смотрит в
 * экран и должен увидеть результат сразу.
 */
const afterPress = editedFor(closedByCourier, DANIYAR.id)
check(afterPress?.body?.text?.includes('завершена'), `сразу после нажатия: «${afterPress?.body?.text ?? '—'}»`)
check(!!afterPress && !afterPress.body?.reply_markup, 'кнопка «Доставил» гаснет в ответ на нажатие, не дожидаясь триггера')

// ── доставили — кнопка «Доставил» гаснет ──────────────────────────────────
const done = await syncStatus('delivered')
const doneMsg = editedFor(done, DANIYAR.id)
check(doneMsg?.body?.text?.includes('завершена'), `после доставки курьеру: «${doneMsg?.body?.text ?? '—'}»`)
check(!!doneMsg && !doneMsg.body?.reply_markup, 'кнопки «Доставил» под сообщением не осталось')
check(!editedFor(done, ASEL.id), 'сообщение второго курьера при этом не трогаем')

// ── отменили до того, как взяли: гаснет у всех ────────────────────────────
await ship('courier')
const cancelled = await syncStatus('cancelled')
const forDaniyar = editedFor(cancelled, DANIYAR.id)
const forAsel = editedFor(cancelled, ASEL.id)
check(forDaniyar?.body?.text?.includes('отменена'), `отмена курьеру: «${forDaniyar?.body?.text ?? '—'}»`)
check(!!forDaniyar && !forDaniyar.body?.reply_markup && !!forAsel && !forAsel.body?.reply_markup,
  'кнопки «Беру» больше нет ни у кого')
check(!!forAsel, 'предложение погашено у обоих, а не у одного')

const stale = await press(DANIYAR, `tak:o:${ORDER}`)
check(toast(stale).includes('неактуальна'), `«Беру» на отменённом заказе: «${toast(stale)}»`)
const { data: afterStale } = await service.from('orders').select('courier_staff_id').eq('id', ORDER).single()
check(!afterStale.courier_staff_id, 'и курьер к отменённому заказу не привязался')

// ── курьер не может подтверждать и отменять заказы ────────────────────────
const forbidden = await press(DANIYAR, `cnl:o:${ORDER}`)
check(toast(forbidden).includes('только взять доставку'), `отмена курьеру недоступна: «${toast(forbidden)}»`)

// ── посторонний в личке ───────────────────────────────────────────────────
const stranger = await press({ id: 555000, first_name: 'Кто-то' }, `tak:o:${ORDER}`)
check(toast(stranger).includes('рабочего чата'), `посторонний: «${toast(stranger)}»`)

// ── курьеров нет — менеджеров предупреждают ───────────────────────────────
await couriers([])
const nobody = await ship('courier')
const warn = sentTo(nobody, ADMIN_CHAT)
check(warn?.body?.text?.includes('некому передать'), `без курьеров: «${(warn?.body?.text ?? '—').split('\n')[0]}»`)

await couriers([])
await service.from('orders').update({ status: 'delivered', courier_staff_id: null, courier_name: null }).eq('id', ORDER)
if (failed) process.exitCode = 1
