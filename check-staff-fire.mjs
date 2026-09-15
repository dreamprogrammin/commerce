/**
 * Увольнение: владелец убирает человека из команды кнопкой.
 *
 * Принимать людей бот умел, убирать — нет. Проверяем весь путь поддельными
 * нажатиями: список команды с кнопками, подтверждение, отзыв доступа, письмо
 * уволенному и повторная заявка с отметкой о прошлом увольнении.
 *
 * Перед запуском (см. docs/HANDOFF.md):
 *   docker run -d --name tg-mock --network supabase_network_<ref> \
 *     -v <scratchpad>:/app -w /app node:22 node tg-mock.mjs
 *   supabase functions serve --env-file tg.env --no-verify-jwt
 *
 *   node check-staff-fire.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = process.env.TG_CALLS ?? '/tmp/tg-calls.jsonl'
const CHAT = -1001234567890

const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777002, first_name: 'Айгуль', username: 'aigul_m' }
const COURIER = { id: 777003, first_name: 'Данияр', username: 'dan_k' }

const service = createClient(SUPA, SERVICE)

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function send(payload) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...payload }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

const say = (text, from, chatId = CHAT, type = 'group') => send({
  message: { message_id: 1, text, chat: { id: chatId, type }, from },
})
const tap = (data, from, chatId = CHAT) => send({
  callback_query: { id: String(Date.now()), data, from, message: { message_id: 7, chat: { id: chatId } } },
})

const texts = cs => cs
  .filter(c => c.method === 'sendMessage' || c.method === 'editMessageText')
  .map(c => c.body.text).join('\n')
const popups = cs => cs.filter(c => c.method === 'answerCallbackQuery').map(c => c.body.text).join('\n')
const keyboard = cs => (cs.find(c => c.body?.reply_markup?.inline_keyboard)
  ?.body.reply_markup.inline_keyboard ?? []).flat()

// ── состав команды ────────────────────────────────────────────────────────
await service.from('staff').delete().gte('telegram_user_id', 0)
await service.from('staff').insert([
  { telegram_user_id: OWNER.id, telegram_username: OWNER.username, full_name: 'Малик', phone: '+77010000001', role: 'owner', status: 'approved' },
  { telegram_user_id: MANAGER.id, telegram_username: MANAGER.username, full_name: 'Айгуль', phone: '+77010000002', role: 'manager', status: 'approved' },
  { telegram_user_id: COURIER.id, telegram_username: COURIER.username, full_name: 'Данияр', phone: '+77010000003', role: 'courier', status: 'approved' },
])

const staffOf = async id => (await service.from('staff').select('*').eq('telegram_user_id', id).single()).data
const courierRow = await staffOf(COURIER.id)
const ownerRow = await staffOf(OWNER.id)

// Незакрытая доставка на курьере: владелец должен увидеть её перед решением.
await service.from('guest_checkouts').delete().eq('guest_email', 'fire-probe@uhti.kz')
const { data: order } = await service.from('guest_checkouts').insert({
  guest_name: 'Покупатель',
  guest_email: 'fire-probe@uhti.kz',
  guest_phone: '+77010000009',
  total_amount: 5000,
  final_amount: 5000,
  delivery_method: 'courier',
  status: 'shipped',
  courier_staff_id: courierRow.id,
}).select('id').single()

// ── список команды ────────────────────────────────────────────────────────
const list = await say('/team', OWNER)
const listButtons = keyboard(list).map(b => b.text)
check(
  listButtons.includes('🚪 Уволить · Айгуль') && listButtons.includes('🚪 Уволить · Данияр'),
  `владельцу видны кнопки увольнения: ${listButtons.join(' | ') || '—'}`,
)
check(!listButtons.some(t => t.includes('Малик')), 'кнопки уволить себя нет')

const asManager = await say('/team', MANAGER)
check(
  !keyboard(asManager).length && texts(asManager).includes('владельцу'),
  'менеджеру список команды не выдан',
)

// ── подтверждение ─────────────────────────────────────────────────────────
const ask = await tap(`job:rm:${courierRow.id}`, OWNER)
const askText = texts(ask)
check(askText.includes('Уволить сотрудника?') && askText.includes('Данияр'), 'спрошено подтверждение')
check(askText.includes('1 заказ'), `незакрытая доставка названа: ${askText.split('\n').find(l => l.includes('⚠️')) ?? '—'}`)
check(
  keyboard(ask).map(b => b.text).join('|') === '🚪 Да, уволить|↩️ Отмена',
  `кнопки подтверждения: ${keyboard(ask).map(b => b.text).join(' | ') || '—'}`,
)

// ── чужие руки ────────────────────────────────────────────────────────────
const byManager = await tap(`job:rmok:${courierRow.id}`, MANAGER)
check(popups(byManager).includes('владелец'), `менеджеру отказано: ${popups(byManager) || '—'}`)
check((await staffOf(COURIER.id)).status === 'approved', 'после отказа человек остался в команде')

const self = await tap(`job:rm:${ownerRow.id}`, OWNER)
check(popups(self).includes('Себя'), `себя уволить нельзя: ${popups(self) || '—'}`)

// ── увольнение ────────────────────────────────────────────────────────────
const fire = await tap(`job:rmok:${courierRow.id}`, OWNER)
const fired = await staffOf(COURIER.id)
check(fired.status === 'fired', `статус в базе: ${fired.status}`)
check(String(fired.fired_by) === String(OWNER.id) && !!fired.fired_at, `записано кем и когда: ${fired.fired_by}, ${fired.fired_at}`)
check(texts(fire).includes('Уволен'), 'в чате осталось решение')
check(texts(fire).includes('За ним ещё 1 заказ'), 'напомнили про незакрытую доставку')

const dm = fire.find(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(COURIER.id))
check(!!dm && dm.body.text.includes('больше не в команде'), `уволенному написали в личку: ${dm?.body?.text?.split('\n')[0] ?? '—'}`)

// ── последствия ───────────────────────────────────────────────────────────
const { data: forDelivery } = await service.from('staff')
  .select('id').eq('role', 'courier').eq('status', 'approved')
check(
  !(forDelivery ?? []).some(r => r.id === courierRow.id),
  'предложения доставки уволенному больше не адресуются',
)

const again = await tap(`job:rm:${courierRow.id}`, OWNER)
check(popups(again).includes('уже уволен'), `повторное увольнение отбито: ${popups(again) || '—'}`)

const listAfter = await say('/team', OWNER)
check(texts(listAfter).includes('Уволенных: 1'), 'в списке команды уволенный посчитан отдельно')
check(!texts(listAfter).includes('Данияр'), 'из состава команды уволенный пропал')

// ── второй владелец увольняется, посторонний не увольняет ─────────────────
await service.from('staff').update({ role: 'owner' }).eq('telegram_user_id', MANAGER.id)
const secondOwner = await staffOf(MANAGER.id)
const twoOwners = await tap(`job:rm:${secondOwner.id}`, OWNER)
check(
  texts(twoOwners).includes('Уволить сотрудника?') && !popups(twoOwners).includes('единственный'),
  'при двух владельцах второй увольняется',
)
await service.from('staff').update({ role: 'manager' }).eq('telegram_user_id', MANAGER.id)

const stranger = await tap(`job:rm:${secondOwner.id}`, { id: 999999, first_name: 'Чужой' })
check(popups(stranger).includes('владелец'), `посторонний ничего не увольняет: ${popups(stranger) || '—'}`)

// ── доступ к заказам отобран ──────────────────────────────────────────────
const worksBefore = await tap(`cfm:g:${order.id}`, MANAGER)
check(
  !popups(worksBefore).includes('пока не в команде'),
  `до увольнения менеджер вёл заказы: ${popups(worksBefore) || '—'}`,
)

await tap(`job:rmok:${secondOwner.id}`, OWNER)
const worksAfter = await tap(`cfm:g:${order.id}`, MANAGER)
check(
  popups(worksAfter).includes('пока не в команде'),
  `после увольнения кнопки заказов отказывают: ${popups(worksAfter) || '—'}`,
)

// ── повторная заявка ──────────────────────────────────────────────────────
await say('/job', COURIER, COURIER.id, 'private')
await say('Данияр Ким', COURIER, COURIER.id, 'private')
await say('+7 701 000 00 03', COURIER, COURIER.id, 'private')
const reapply = await tap('job:role:courier', COURIER, COURIER.id)
const toOwner = reapply.find(c => c.method === 'sendMessage' && String(c.body.chat_id) === String(CHAT))
check(
  !!toOwner && toOwner.body.text.includes('увольняли'),
  `в новой заявке видно прошлое увольнение: ${toOwner?.body?.text?.split('\n').find(l => l.includes('увольняли')) ?? '—'}`,
)

// ── уборка ────────────────────────────────────────────────────────────────
await service.from('guest_checkouts').delete().eq('guest_email', 'fire-probe@uhti.kz')

console.log(failed ? '\n❌ есть падения' : '\n✅ всё сошлось')
process.exit(failed ? 1 : 0)
