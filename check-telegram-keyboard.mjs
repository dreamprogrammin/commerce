/**
 * Кнопки по умолчанию: постоянная клавиатура у поля ввода.
 *
 * Менеджеру не нужно ни вызывать панель, ни закреплять её — кнопки видны
 * всегда. Проверяется, что они ставятся, что нажатие открывает список и что
 * само нажатие не остаётся в чате.
 *   node check-telegram-keyboard.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const ORDER = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

const service = createClient(SUPA, SERVICE)
await service.from('orders').update({
  status: 'processing', assigned_admin_name: 'Айгуль Смагулова', assigned_admin_username: 'aigul_m',
}).eq('id', ORDER)

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function say(text, { username = 'aigul_m', messageId = 77 } = {}) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: messageId, text,
        chat: { id: CHAT, type: 'group' },
        from: username ? { id: 42, first_name: 'Айгуль', username } : { id: 42, first_name: 'Айгуль' },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── /panel ставит постоянную клавиатуру ───────────────────────────────────
const panelCalls = await say('/panel')
const withKeyboard = panelCalls.find(c => c.body?.reply_markup?.keyboard)
check(!!withKeyboard, 'панель ставит постоянную клавиатуру')
const keys = withKeyboard?.body?.reply_markup?.keyboard?.flat().map(b => b.text) ?? []
check(keys.includes('📋 Активные заказы') && keys.includes('👤 Мои заказы'), `кнопки: ${keys.join(' | ')}`)
check(withKeyboard?.body?.reply_markup?.is_persistent === true, 'клавиатура не сворачивается при наборе')
check(withKeyboard?.body?.reply_markup?.resize_keyboard === true, 'клавиатура подогнана по высоте')

// ── нажатие кнопки открывает список ───────────────────────────────────────
const tapCalls = await say('📋 Активные заказы', { messageId: 88 })
const list = tapCalls.find(c => c.method === 'sendMessage')
check(!!list && list.body.text.includes('Активные заказы'), 'нажатие кнопки открывает список')
check(
  (list?.body?.reply_markup?.inline_keyboard ?? []).flat().some(b => b.callback_data?.startsWith('ord:')),
  'в списке кнопка на каждый заказ',
)

// ── само нажатие не остаётся в чате ───────────────────────────────────────
const deleted = tapCalls.find(c => c.method === 'deleteMessage')
check(deleted?.body?.message_id === 88, 'сообщение-нажатие удалено из чата')

// ── «Мои заказы» ──────────────────────────────────────────────────────────
const mine = (await say('👤 Мои заказы')).find(c => c.method === 'sendMessage')
check(mine?.body?.text?.includes('Ваши активные заказы'), 'кнопка «Мои заказы» показывает свои')

const noNick = (await say('👤 Мои заказы', { username: null })).find(c => c.method === 'sendMessage')
check(noNick?.body?.text?.includes('ник'), 'без ника кнопка объясняет, что делать')

// ── обычный текст не считается кнопкой ────────────────────────────────────
const chatter = await say('привет, кто возьмёт заказ?')
check(!chatter.some(c => c.method === 'deleteMessage'), 'обычное сообщение в чате не удаляется')

await service.from('orders').update({
  status: 'shipped', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)
if (failed) process.exitCode = 1
