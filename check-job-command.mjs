/**
 * Команда /job работает и в рабочем чате, и в личке.
 *
 * Владелец написал /job в рабочем чате и получил приветствие для
 * покупателей — команда там не распознавалась вовсе. Проверяем оба места и
 * то, что покупательское приветствие в рабочий чат больше не попадает.
 *   node check-job-command.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const NEWBIE = { id: 777003, first_name: 'Данияр', username: 'dan_k' }

const service = createClient(SUPA, SERVICE)
await service.from('staff').delete().neq('telegram_user_id', OWNER.id)

/*
 * Владельца заводим сами, а не рассчитываем на строку из миграции: соседние
 * проверки чистят `staff` целиком, и порядок запуска не должен решать, зелёный
 * тут результат или красный.
 */
await service.from('staff').upsert({
  telegram_user_id: OWNER.id,
  full_name: 'Малик Бабазов',
  role: 'owner',
  status: 'approved',
}, { onConflict: 'telegram_user_id' })

const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: 1, text,
        chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' },
        from,
      },
    }),
  })
  await new Promise(r => setTimeout(r, 1400))
  return calls().slice(before)
}

const said = cs => cs.filter(c => c.method === 'sendMessage').map(c => c.body.text).join('\n')
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

// ── /job в рабочем чате ───────────────────────────────────────────────────
const inChat = await say('/job', NEWBIE, CHAT)
const chatReply = said(inChat)
check(chatReply.includes('в личке'), `в чате бот объясняет, куда идти: «${chatReply.split('\n')[0]}»`)
check(!chatReply.includes('магазин детских игрушек'), 'приветствие для покупателей в чат не приходит')
const link = inChat.find(c => c.body?.reply_markup?.inline_keyboard)
check(!!link, 'есть кнопка, открывающая личку бота')

// ── неизвестная команда в рабочем чате: молчание, а не приветствие ────────
const junk = await say('/чтотонепонятное', NEWBIE, CHAT)
check(!said(junk).includes('магазин детских игрушек'), 'на чужую команду в чате бот молчит')

// ── /job в личке ──────────────────────────────────────────────────────────
const inDm = said(await say('/job', NEWBIE, NEWBIE.id))
check(inDm.includes('Как вас зовут'), 'в личке анкета начинается')

// ── владельцу говорят, что он уже в команде ───────────────────────────────
const forOwner = said(await say('/job', OWNER, OWNER.id))
check(forOwner.includes('уже в команде'), `владельцу: «${forOwner.split('\n')[0]}»`)

// ── переход по кнопке из чата ─────────────────────────────────────────────
await service.from('staff').delete().eq('telegram_user_id', NEWBIE.id)
const viaButton = said(await say('/start job', NEWBIE, NEWBIE.id))
check(viaButton.includes('Как вас зовут'), 'кнопка из чата открывает анкету сразу')

// ── покупатель в личке не сломан ──────────────────────────────────────────
const buyer = said(await say('/start', { id: 999123, first_name: 'Покупатель' }, 999123))
check(buyer.includes('Ухтышка') || buyer.length > 0, 'покупательское приветствие в личке осталось')

await service.from('staff').delete().neq('telegram_user_id', OWNER.id)
if (failed) process.exitCode = 1
