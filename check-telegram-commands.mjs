/**
 * Команды менеджера в рабочем чате: /orders, /my, /order номер.
 *
 * Telegram подменён заглушкой (TELEGRAM_API_BASE), поэтому видно ровно то,
 * что бот отправил бы в чат.
 *   node check-telegram-commands.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = process.env.CALLS ?? '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const ORDER = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

const service = createClient(SUPA, SERVICE)
await service.from('orders').update({
  status: 'processing', assigned_admin_name: 'Айгуль Смагулова', assigned_admin_username: 'aigul_m',
}).eq('id', ORDER)

function calls() {
  return fs.existsSync(CALLS)
    ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    : []
}

async function say(text, { chatId = CHAT, username = 'aigul_m' } = {}) {
  // Считаем по НЕПУСТЫМ строкам: файл заканчивается переводом строки, и
  // подсчёт «как есть» захватывал хвост предыдущего ответа — из-за этого
  // проверка про отсутствующий ник читала чужое сообщение.
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1, text,
        chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' },
        // `username: null` — менеджер без ника: поле в апдейте отсутствует.
        from: username ? { id: 42, first_name: 'Айгуль', username } : { id: 42, first_name: 'Айгуль' },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1500))
  return calls()
    .slice(before)
    .filter(c => c.method === 'sendMessage')
    .map(c => c.body.text)
}

let failed = false
function check(ok, label, extra = '') {
  if (!ok) failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}${extra}`)
}

const orders = (await say('/orders')).join('\n')
check(orders.includes('Активные заказы'), 'команда /orders отвечает списком')
check(orders.includes('5e4fc2'), 'в списке есть номер заказа')
check(orders.includes('Айгуль Смагулова'), 'видно, кто ведёт заказ')
console.log('\n--- что увидит менеджер ---\n' + orders + '\n')

const mine = (await say('/my')).join('\n')
check(mine.includes('Ваши активные заказы') && mine.includes('5e4fc2'), 'команда /my показывает свои заказы')

const foreign = (await say('/my', { username: 'someone_else' })).join('\n')
check(foreign.includes('ничего не числится'), 'чужие заказы в /my не попадают')

const noNick = (await say('/my', { username: null })).join('\n')
check(noNick.includes('ник'), 'без ника команда объясняет, что делать')

const card = (await say(`/order 5e4fc2`)).join('\n')
check(card.includes('Заказ №5e4fc2'), 'команда /order показывает карточку')
check(card.includes('Телефон') || card.includes('Покупатель'), 'в карточке есть данные покупателя')
console.log('\n--- карточка ---\n' + card + '\n')

const missing = (await say('/order 000000')).join('\n')
check(missing.includes('не найден'), 'несуществующий номер — понятный ответ')

const noArg = (await say('/order')).join('\n')
check(noArg.includes('Укажите номер'), 'команда без номера подсказывает формат')

// В личке (не рабочий чат) админские команды работать не должны
const inPrivate = (await say('/orders', { chatId: 555001 })).join('\n')
check(!inPrivate.includes('Активные заказы'), 'в личке команда менеджера не отвечает')

await service.from('orders').update({
  status: 'shipped', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)
if (failed) process.exitCode = 1
