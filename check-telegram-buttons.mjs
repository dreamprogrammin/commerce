/**
 * Кнопки под карточкой заказа в Telegram: нажатие делает работу и записывает,
 * КТО его сделал.
 *
 * Проверяет вебхук целиком, кроме самой отправки в Telegram (её адрес зашит
 * в коде): поддельный `callback_query` → вызов нужной эдж-функции → изменения
 * в базе.
 *
 * Стенд: локальная база + `supabase functions serve --env-file ...` с
 * TELEGRAM_CHAT_ID и ADMIN_SECRET. `node check-telegram-buttons.mjs`
 */
import { createClient } from '@supabase/supabase-js'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CHAT_ID = -1001234567890
const ORDER = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

const service = createClient(SUPA, SERVICE)

async function press(data, { chatId = CHAT_ID, from } = {}) {
  const res = await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: String(Date.now()),
        data,
        from: from ?? { id: 42, first_name: 'Айгуль', last_name: 'Смагулова', username: 'aigul_m' },
        message: { message_id: 5, chat: { id: chatId } },
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1200))
  return res.status
}

async function order() {
  const { data } = await service
    .from('orders')
    .select('status, assigned_admin_name, assigned_admin_username')
    .eq('id', ORDER)
    .single()
  return data
}

let failed = false
function check(ok, text) {
  if (!ok) failed = true
  console.log(`${ok ? '✅' : '❌'} ${text}`)
}

// ── нажатие «Взять в работу» из рабочего чата ──────────────────────────────
await service.from('orders').update({
  status: 'new', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)

await press(`asg:o:${ORDER}`)
let o = await order()
check(o.status === 'processing', `заказ взят в работу (статус «${o.status}»)`)
check(o.assigned_admin_name === 'Айгуль Смагулова', `записано имя нажавшего: «${o.assigned_admin_name}»`)
check(o.assigned_admin_username === 'aigul_m', `записан ник: «${o.assigned_admin_username}»`)

// ── следующий шаг: подтверждение ───────────────────────────────────────────
await press(`cfm:o:${ORDER}`)
o = await order()
check(o.status === 'confirmed', `подтверждено (статус «${o.status}»)`)

// ── нажатие из чужого чата не должно ничего делать ─────────────────────────
const before = (await order()).status
await press(`shp:o:${ORDER}`, { chatId: -100999, from: { id: 7, first_name: 'Чужой' } })
o = await order()
check(o.status === before, `из чужого чата действие не проходит (статус остался «${o.status}»)`)

// ── мусор в callback_data ──────────────────────────────────────────────────
const code = await press('drop-table:o:1')
o = await order()
check(code === 200 && o.status === before, 'мусорная кнопка не роняет вебхук и ничего не меняет')

// ── второй менеджер жмёт «взять» по уже взятому заказу ─────────────────────
await service.from('orders').update({ status: 'new', assigned_admin_name: 'Айгуль Смагулова' }).eq('id', ORDER)
await press(`asg:o:${ORDER}`, { from: { id: 8, first_name: 'Данияр' } })
o = await order()
check(
  o.assigned_admin_name === 'Айгуль Смагулова',
  `чужой заказ не перехватывается (остался у «${o.assigned_admin_name}»)`,
)

await service.from('orders').update({
  status: 'shipped', assigned_admin_name: null, assigned_admin_username: null,
}).eq('id', ORDER)
if (failed) process.exitCode = 1
