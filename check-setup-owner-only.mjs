/**
 * `/setup` — только владельцу (20 октября 2026).
 *
 * Раньше команду выполнял любой, кто напишет боту: вебхук, команды и меню
 * ставились заново, а в рабочий чат уходило «Кнопки под полем ввода…» — от
 * постороннего. Владелец: «ограничить». Правило то же, что у `/plan`,
 * `/team`, `/sales`: подтверждённый владелец из `staff`.
 *
 * Нужен локальный стенд бота (docs/HANDOFF.md): заглушка tg-mock и
 * `supabase functions serve --env-file <…> --no-verify-jwt`. Если в окружении
 * функций заведён TELEGRAM_WEBHOOK_SECRET — передать его в TG_WEBHOOK_SECRET.
 *   TG_CALLS=<…>/tg-calls.jsonl TG_WEBHOOK_SECRET=<…> node check-setup-owner-only.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const SCRATCH = process.env.SC || os.tmpdir()

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = process.env.TG_CALLS ?? `${SCRATCH}/tg-calls.jsonl`
const SECRET = process.env.TG_WEBHOOK_SECRET
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777401, first_name: 'Айгуль', username: 'aigul_m' }
const STRANGER = { id: 555003, first_name: 'Посторонний' }

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// Свои строки ставим поверх того, что лежит в локальной базе, и в конце возвращаем как было.
const ids = [OWNER.id, MANAGER.id, STRANGER.id]
const { data: saved } = await service.from('staff').select('*').in('telegram_user_id', ids)
await service.from('staff').delete().in('telegram_user_id', ids)
await service.from('staff').insert([
  { telegram_user_id: OWNER.id, full_name: 'Малик Бабазов', role: 'owner', status: 'approved' },
  { telegram_user_id: MANAGER.id, full_name: 'Айгуль Смагулова', role: 'manager', status: 'approved' },
])

async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(SECRET ? { 'X-Telegram-Bot-Api-Secret-Token': SECRET } : {}),
    },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 42, text, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' }, from },
    }),
  })
  await new Promise(r => setTimeout(r, 1600))
  return calls().slice(before)
}

const SETUP_METHODS = ['setWebhook', 'setMyCommands', 'setMyDescription', 'setMyShortDescription', 'setChatMenuButton']
const reconfigured = cs => cs.filter(c => SETUP_METHODS.includes(c.method)).map(c => c.method)
const said = cs => cs.filter(c => c.method === 'sendMessage').map(c => c.body?.text ?? '').join('\n')

for (const [who, from, chatId] of [
  ['посторонний в личке', STRANGER, STRANGER.id],
  ['менеджер в рабочем чате', MANAGER, CHAT],
]) {
  const cs = await say('/setup', from, chatId)
  const touched = reconfigured(cs)
  check(touched.length === 0, `${who}: бот не перенастроен${touched.length ? ` (${touched.join(', ')})` : ''}`)
  check(!said(cs).includes('Кнопки под полем ввода'), `${who}: в рабочий чат не ушло «Кнопки под полем ввода…»`)
  check(said(cs).includes('доступна владельцу'), `${who}: ответ — «доступна владельцу»`)
}

const own = await say('/setup', OWNER, OWNER.id)
check(reconfigured(own).includes('setWebhook'), 'владелец: вебхук переставлен')
check(reconfigured(own).includes('setMyCommands'), 'владелец: команды поставлены')
check(said(own).includes('Setup complete'), 'владелец: отчёт о настройке')

await service.from('staff').delete().in('telegram_user_id', ids)
if (saved?.length)
  await service.from('staff').insert(saved)
if (failed)
  process.exitCode = 1
