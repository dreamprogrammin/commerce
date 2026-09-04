/**
 * Кнопки владельца — нативные: в постоянной клавиатуре и в меню команд.
 *
 * Владелец: «все кнопки для владельца команды должны быть нативно
 * отображены». Раньше «Команда» и «Отчёт» жили только инлайн-кнопками внутри
 * сообщения панели.
 *   node check-owner-buttons.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'
const CHAT = -1001234567890
const OWNER = { id: 1321501590, first_name: 'Малик', username: 'owner' }
const MANAGER = { id: 777401, first_name: 'Айгуль', username: 'aigul_m' }

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await service.from('staff').delete().in('telegram_user_id', [OWNER.id, MANAGER.id])
await service.from('staff').insert([
  { telegram_user_id: OWNER.id, full_name: 'Малик Бабазов', role: 'owner', status: 'approved' },
  { telegram_user_id: MANAGER.id, full_name: 'Айгуль Смагулова', role: 'manager', status: 'approved' },
])

async function say(text, from, chatId) {
  const before = calls().length
  await fetch(`${SUPA}/functions/v1/telegram-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 42, text, chat: { id: chatId, type: chatId < 0 ? 'group' : 'private' }, from },
    }),
  })
  await new Promise(r => setTimeout(r, 1600))
  return calls().slice(before)
}

const sent = cs => cs.filter(c => c.method === 'sendMessage')
const said = cs => sent(cs).map(c => c.body.text).join('\n')
const keyboard = cs => sent(cs).map(c => c.body?.reply_markup?.keyboard).find(Boolean)
const flat = kb => (kb ?? []).flat().map(b => b.text)

// ── настройка бота раскладывает кнопки и меню ─────────────────────────────
const setup = await say('/setup', OWNER, OWNER.id)
const setCommands = setup.filter(c => c.method === 'setMyCommands')
const ownerScope = setCommands.find(c => String(c.body?.scope?.chat_id) === String(OWNER.id))
const chatScope = setCommands.find(c => String(c.body?.scope?.chat_id) === String(CHAT))

check(!!ownerScope, 'у владельца заводится СВОЁ меню команд в личке')
check((ownerScope?.body?.commands ?? []).some(c => c.command === 'report')
  && (ownerScope?.body?.commands ?? []).some(c => c.command === 'team'),
  `в нём отчёт и команда: ${(ownerScope?.body?.commands ?? []).map(c => '/' + c.command).join(' ')}`)
check((chatScope?.body?.commands ?? []).some(c => c.command === 'report'),
  'в меню рабочего чата отчёт тоже появился')

const setupKb = flat(setup.find(c => c.method === 'sendMessage' && c.body?.reply_markup?.keyboard)?.body?.reply_markup?.keyboard)
check(setupKb.includes('👥 Команда') && setupKb.includes('📊 Отчёт'),
  `клавиатура рабочего чата: ${setupKb.join(' | ') || '—'}`)

// ── кнопка «Отчёт» в рабочем чате ─────────────────────────────────────────
const report = await say('📊 Отчёт', OWNER, CHAT)
check(said(report).includes('За какой период'), `нажатие «Отчёт»: «${said(report).split('\n')[0]}»`)
check(report.some(c => c.method === 'deleteMessage'), 'нажатие убирается из чата, чтобы не мусорить')

// ── кнопка «Команда» в рабочем чате ───────────────────────────────────────
const team = await say('👥 Команда', OWNER, CHAT)
check(said(team).includes('Команда') && said(team).includes('Малик'), 'нажатие «Команда» показывает состав')

// ── менеджеру эти кнопки не работают ──────────────────────────────────────
const denied = await say('📊 Отчёт', MANAGER, CHAT)
check(said(denied).includes('дела владельца'), `менеджеру: «${said(denied).split('\n')[0]}»`)

// ── те же кнопки в личке владельца ────────────────────────────────────────
const dmStart = await say('/start', OWNER, OWNER.id)
check(flat(keyboard(dmStart)).includes('📊 Отчёт'), `в личке владельца клавиатура: ${flat(keyboard(dmStart)).join(' | ') || '—'}`)
check(!said(dmStart).includes('магазин детских игрушек'), 'и покупательского приветствия владельцу больше нет')

const dmReport = await say('📊 Отчёт', OWNER, OWNER.id)
check(said(dmReport).includes('За какой период'), 'кнопка «Отчёт» работает и в личке')

const dmTeam = await say('/team', OWNER, OWNER.id)
check(said(dmTeam).includes('Малик'), 'команда /team работает в личке')

// ── посторонний в личке видит обычное приветствие ─────────────────────────
const stranger = await say('/start', { id: 555002, first_name: 'Гость' }, 555002)
check(said(stranger).includes('Ухтышка'), 'покупателю в личке — прежнее приветствие')

await service.from('staff').delete().eq('telegram_user_id', MANAGER.id)
if (failed) process.exitCode = 1
