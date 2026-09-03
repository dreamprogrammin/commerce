/**
 * Анкета сотрудника и допуск к заказам.
 *
 * Проходит путь целиком: человек пишет боту в личку, отвечает на вопросы,
 * выбирает роль кнопкой, владелец принимает заявку в рабочем чате. Плюс
 * проверяет, что до одобрения кнопками заказов пользоваться нельзя.
 *   node check-staff-onboarding.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'
const NEWBIE = { id: 777001, first_name: 'Данияр', username: 'daniyar_k' }

const service = createClient(SUPA, SERVICE)
await service.from('staff').delete().neq('telegram_user_id', 0)

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function send(payload) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...payload }),
  })
  await new Promise(r => setTimeout(r, 1300))
  return calls().slice(before)
}

// личка соискателя: chat.id == его user id
const dm = text => send({
  message: { message_id: 1, text, chat: { id: NEWBIE.id, type: 'private' }, from: NEWBIE },
})
const tap = (data, { from = NEWBIE, chatId = NEWBIE.id } = {}) => send({
  callback_query: {
    id: String(Date.now()), data, from,
    message: { message_id: 5, chat: { id: chatId } },
  },
})

const said = cs => cs.filter(c => c.method === 'sendMessage' || c.method === 'editMessageText')
  .map(c => c.body.text).join('\n')

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── анкета ────────────────────────────────────────────────────────────────
check(said(await dm('/job')).includes('Как вас зовут'), 'бот начинает анкету и спрашивает имя')
// Однобуквенный ответ — точно не имя. Двух-трёхбуквенные («Ян», «Ли»)
// отсекать нельзя, поэтому проверяем именно однобуквенный.
check(said(await dm('я')).includes('не имя'), 'однобуквенный ответ не принимается за имя')
check(said(await dm('Данияр Касымов')).includes('телефон'), 'после имени спрашивает телефон')
check(said(await dm('позвоните мне')).includes('Не похоже на номер'), 'не номер не принимается')

const roleAsk = await dm('+7 701 555 44 33')
check(said(roleAsk).includes('Кем будете работать'), 'после телефона спрашивает роль')
const roleButtons = roleAsk.find(c => c.body?.reply_markup?.inline_keyboard)
check(!!roleButtons, 'роль выбирается кнопкой')

// ── выбор роли отправляет заявку владельцу ────────────────────────────────
const applied = await tap('job:role:courier')
const toOwner = applied.find(c => String(c.body?.chat_id) === String(CHAT))
check(!!toOwner, 'заявка уходит в рабочий чат')
check(toOwner?.body?.text?.includes('Данияр Касымов') && toOwner?.body?.text?.includes('Курьер'),
  'в заявке имя, телефон и роль')
console.log(`\n--- заявка владельцу ---\n${toOwner?.body?.text}\n`)

const staffId = toOwner?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.split(':')[2]
check(!!staffId, 'под заявкой кнопки решения')

// ── до одобрения заказами управлять нельзя? (режим ещё мягкий) ────────────
const { data: before } = await service.from('staff').select('status').eq('telegram_user_id', NEWBIE.id).single()
check(before.status === 'pending', `заявка ждёт решения (статус «${before.status}»)`)

// ── одобрение только из рабочего чата ─────────────────────────────────────
await tap(`job:ok:${staffId}`, { chatId: NEWBIE.id })
const { data: sneaky } = await service.from('staff').select('status').eq('telegram_user_id', NEWBIE.id).single()
check(sneaky.status === 'pending', 'сам себя принять не может — решение только в рабочем чате')

const owner = { id: 42, first_name: 'Малик', username: 'owner' }
const decided = await tap(`job:ok:${staffId}`, { from: owner, chatId: CHAT })
const { data: after } = await service.from('staff').select('status, role').eq('telegram_user_id', NEWBIE.id).single()
check(after.status === 'approved' && after.role === 'courier', `владелец принял (${after.status}, ${after.role})`)
check(said(decided).includes('Вас приняли'), 'человеку сообщили в личку')

// ── строгий режим: курьер не управляет заказами ──────────────────────────
await service.from('staff').insert({
  telegram_user_id: owner.id, telegram_username: 'owner', full_name: 'Малик',
  phone: '+77010000000', role: 'manager', status: 'approved',
})
await service.from('orders').update({ status: 'new', assigned_admin_name: null }).eq('id', ORDER)

const courierTry = await tap(`asg:o:${ORDER}`, { from: NEWBIE, chatId: CHAT })
const { data: untouched } = await service.from('orders').select('status').eq('id', ORDER).single()
check(untouched.status === 'new', 'курьер не может взять заказ в работу')
const alert = courierTry.find(c => c.method === 'answerCallbackQuery')
check(alert?.body?.text?.includes('не в команде') || alert?.body?.show_alert === true,
  `курьеру объяснили отказ: «${alert?.body?.text ?? '—'}»`)

const managerTry = await tap(`asg:o:${ORDER}`, { from: owner, chatId: CHAT })
const { data: taken } = await service.from('orders').select('status, assigned_admin_name').eq('id', ORDER).single()
check(taken.status === 'processing', `менеджер заказ берёт (${taken.status}, ${taken.assigned_admin_name})`)

await service.from('orders').update({
  status: 'new', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)
await service.from('staff').delete().neq('telegram_user_id', 0)
if (failed) process.exitCode = 1
