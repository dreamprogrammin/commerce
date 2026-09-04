/**
 * Владелец: заведён сразу, видит команду, решает по заявкам.
 *
 * Владелец не подаёт заявку сам себе — он попадает в `staff` миграцией,
 * которая берёт его Telegram-id из profiles (role = 'admin').
 *   node check-staff-owner.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777002, first_name: 'Айгуль', username: 'aigul_m' }

const service = createClient(SUPA, SERVICE)
await service.from('staff').delete().neq('telegram_user_id', OWNER.id)

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function send(payload) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...payload }),
  })
  await new Promise(r => setTimeout(r, 1400))
  return calls().slice(before)
}

const say = (text, from) => send({
  message: { message_id: 1, text, chat: { id: CHAT, type: 'group' }, from },
})
const tap = (data, from, chatId = CHAT) => send({
  callback_query: { id: String(Date.now()), data, from, message: { message_id: 7, chat: { id: chatId } } },
})
const said = cs => cs.filter(c => c.method === 'sendMessage' || c.method === 'editMessageText')
  .map(c => c.body.text).join('\n')

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── владелец уже в базе ───────────────────────────────────────────────────
const { data: me } = await service.from('staff').select('role, status').eq('telegram_user_id', OWNER.id).single()
check(me?.role === 'owner' && me?.status === 'approved', `владелец заведён: ${me?.role}, ${me?.status}`)

// ── в панели владельцу видна команда ──────────────────────────────────────
const panelOwner = (await say('/panel', OWNER)).find(c => c.body?.reply_markup?.inline_keyboard)
const ownerButtons = (panelOwner?.body?.reply_markup?.inline_keyboard ?? []).flat().map(b => b.text)
check(ownerButtons.includes('👥 Команда'), `владельцу видна кнопка команды: ${ownerButtons.join(' | ')}`)

const panelOther = (await say('/panel', MANAGER)).find(c => c.body?.reply_markup?.inline_keyboard)
const otherButtons = (panelOther?.body?.reply_markup?.inline_keyboard ?? []).flat().map(b => b.text)
check(!otherButtons.includes('👥 Команда'), 'постороннему кнопка команды не видна')

// ── список команды ────────────────────────────────────────────────────────
const list = said(await tap('stf:list', OWNER))
check(list.includes('Команда'), 'владелец открывает список команды')
check(list.includes('Малик'), 'в списке есть он сам')
console.log(`\n--- список команды ---\n${list}\n`)

const denied = await tap('stf:list', MANAGER)
const alert = denied.find(c => c.method === 'answerCallbackQuery')
check(alert?.body?.text?.includes('владельцу'), `посторонний список не видит: «${alert?.body?.text ?? '—'}»`)

// ── заявку принимает владелец ─────────────────────────────────────────────
const { data: applicant } = await service.from('staff').insert({
  telegram_user_id: MANAGER.id, telegram_username: MANAGER.username,
  full_name: 'Айгуль Смагулова', phone: '+77015554433', role: 'manager', status: 'pending',
}).select('id').single()

await tap(`job:ok:${applicant.id}`, MANAGER)
const { data: notYet } = await service.from('staff').select('status').eq('id', applicant.id).single()
check(notYet.status === 'pending', 'сам себя менеджер не принимает')

await tap(`job:ok:${applicant.id}`, OWNER)
const { data: approved } = await service.from('staff').select('status').eq('id', applicant.id).single()
check(approved.status === 'approved', `владелец принял заявку (${approved.status})`)

// ── владелец ведёт заказы сам ─────────────────────────────────────────────
/*
 * Пока менеджеров нет, заказы разбирает владелец. Строгий режим при этом уже
 * включён (в `staff` есть принятый человек), поэтому проверка не лишняя:
 * именно она ловит случай «сам себе не даёт взять заказ».
 */
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'
await service.from('orders').update({
  status: 'new', assigned_admin_name: null, assigned_admin_username: null, assigned_at: null,
}).eq('id', ORDER)

await tap(`asg:o:${ORDER}`, OWNER)
const { data: taken } = await service.from('orders')
  .select('status, assigned_admin_name').eq('id', ORDER).single()
check(taken.assigned_admin_name === 'Малик', `владелец берёт заказ в работу: ${taken.assigned_admin_name ?? '—'}`)

await tap(`cfm:o:${ORDER}`, OWNER)
const { data: confirmed } = await service.from('orders').select('status').eq('id', ORDER).single()
check(confirmed.status === 'confirmed', `и подтверждает его сам (статус: ${confirmed.status})`)

await service.from('staff').delete().neq('telegram_user_id', OWNER.id)
if (failed) process.exitCode = 1
