/**
 * Панель заказов: менеджер работает кнопками, ничего не печатая.
 *
 * Telegram подменён заглушкой (TELEGRAM_API_BASE) — видно ровно то, что бот
 * отправил бы в чат, и какие кнопки он рисует.
 *   node check-telegram-panel.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
// Заказ С ПОЗИЦИЯМИ: карточка обязана показывать состав, иначе менеджеру
// нечего собирать, и он вернётся к прокрутке ленты.
const ORDER = 'd7a7ed7f-94dc-4895-8838-90562bf973cb'

const service = createClient(SUPA, SERVICE)
await service.from('orders').update({
  status: 'new', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function send(payload) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...payload }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls().slice(before)
}

const say = text => send({
  message: { message_id: 1, text, chat: { id: CHAT, type: 'group' }, from: { id: 42, first_name: 'Айгуль', username: 'aigul_m' } },
})

const tap = (data, messageId = 100) => send({
  callback_query: {
    id: String(Date.now()), data,
    from: { id: 42, first_name: 'Айгуль', last_name: 'Смагулова', username: 'aigul_m' },
    message: { message_id: messageId, chat: { id: CHAT } },
  },
})

const buttons = c => (c?.body?.reply_markup?.inline_keyboard ?? []).flat()
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── панель ────────────────────────────────────────────────────────────────
/*
 * `/panel` присылает ДВА сообщения: сперва постоянную клавиатуру у поля
 * ввода, затем саму панель с инлайн-кнопками. Берём именно панель — раньше
 * тест брал первое сообщение и после появления клавиатуры стал смотреть не
 * туда.
 */
const panel = (await say('/panel'))
  .find(c => c.method === 'sendMessage' && c.body?.reply_markup?.inline_keyboard)
check(!!panel, 'команда /panel присылает панель')
const panelButtons = buttons(panel).map(b => b.text)
check(panelButtons.includes('📋 Активные заказы') && panelButtons.includes('👤 Мои заказы'),
  `на панели кнопки: ${panelButtons.join(' | ')}`)
console.log(`\n--- панель ---\n${panel?.body?.text}\n`)

// ── нажатие «Активные» на панели → новое сообщение со списком ─────────────
const listCalls = await tap('pnl:a')
const list = listCalls.find(c => c.method === 'sendMessage')
check(!!list, 'нажатие на панели присылает список ОТДЕЛЬНЫМ сообщением')
check(!listCalls.some(c => c.method === 'editMessageText'), 'сама панель при этом не переписывается')
const orderButtons = buttons(list).filter(b => b.callback_data?.startsWith('ord:'))
check(orderButtons.length > 0, `в списке кнопка на каждый заказ (${orderButtons.length} шт.)`)
check(buttons(list).some(b => b.text === '🔄 Обновить') && buttons(list).some(b => b.text === '✖️ Закрыть'),
  'в списке есть «Обновить» и «Закрыть»')
console.log(`--- список ---\n${list?.body?.text?.split('\n').slice(0, 4).join('\n')}\n   кнопки: ${buttons(list).map(b => b.text).slice(0, 3).join(' | ')}…\n`)

// ── нажатие на заказ → карточка ПРАВКОЙ того же сообщения ────────────────
const target = orderButtons.find(b => b.callback_data.endsWith(ORDER)) ?? orderButtons[0]
const cardCalls = await tap(target.callback_data, 200)
const card = cardCalls.find(c => c.method === 'editMessageText')
check(!!card, 'заказ открывается карточкой в том же сообщении')
check(card?.body?.text?.includes('Заказ №'), 'карточка показывает заказ')
check(card?.body?.text?.includes('*Состав:*'), 'в карточке есть состав заказа')
const cardButtons = buttons(card).map(b => b.text)
check(cardButtons.includes('← К списку'), `на карточке есть возврат: ${cardButtons.join(' | ')}`)
console.log(`--- карточка ---\n${card?.body?.text}\n   кнопки: ${cardButtons.join(' | ')}\n`)

// ── действие прямо с карточки ────────────────────────────────────────────
const actionButton = buttons(card).find(b => b.callback_data?.startsWith('act:'))
check(!!actionButton, 'на карточке есть действие с заказом')
const afterAction = await tap(actionButton.callback_data, 200)
const redrawn = afterAction.filter(c => c.method === 'editMessageText').pop()
const { data: updated } = await service.from('orders').select('status, assigned_admin_name').eq('id', ORDER).single()
check(updated.status === 'processing', `действие выполнено (статус «${updated.status}»)`)
check(updated.assigned_admin_name === 'Айгуль Смагулова', `записан исполнитель: ${updated.assigned_admin_name}`)
check(redrawn?.body?.text?.includes('в работе'), 'карточка сразу показывает новый статус')

// ── возврат к списку и закрытие ──────────────────────────────────────────
const back = (await tap('mnu:a', 200)).find(c => c.method === 'editMessageText')
check(!!back && back.body.text.includes('Активные заказы'), 'кнопка «← К списку» возвращает список')

const closed = (await tap('cls', 200)).find(c => c.method === 'deleteMessage')
check(!!closed, 'кнопка «Закрыть» убирает сообщение из чата')

// ── чужой чат ────────────────────────────────────────────────────────────
const foreign = await send({
  callback_query: {
    id: 'x', data: 'pnl:a', from: { id: 9, first_name: 'Чужой' },
    message: { message_id: 1, chat: { id: 555001 } },
  },
})
check(!foreign.some(c => c.method === 'sendMessage'), 'из чужого чата панель не отвечает списком')

await service.from('orders').update({
  status: 'shipped', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)
if (failed) process.exitCode = 1
