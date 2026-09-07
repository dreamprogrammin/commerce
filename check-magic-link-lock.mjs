/**
 * Аудит magic links: публичный ключ НЕ должен уметь выписывать ссылку входа
 * для чужого аккаунта, а внутренний путь (триггеры) — должен продолжать
 * работать.
 *
 * Дыра, найденная 7 сентября 2026: generate_magic_link — SECURITY DEFINER с
 * EXECUTE у PUBLIC. Любой с anon-ключом (он в разметке сайта) звал её с чужим
 * user_id и получал рабочий токен входа → захват аккаунта.
 *   node check-magic-link-lock.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const service = createClient(SUPA, SERVICE)
const anon = createClient(SUPA, ANON)

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

const { data: victim } = await service.from('profiles').select('id').limit(1).single()

// ── публичным ключом — нельзя ─────────────────────────────────────────────
const { data: anonData, error: anonErr } = await anon.rpc('generate_magic_link', {
  p_user_id: victim.id, p_redirect_path: '/profile',
})
check(!anonData && !!anonErr, `anon получает отказ: ${anonErr?.message ?? 'но вернулась ссылка — ДЫРА ОТКРЫТА'}`)
check((anonErr?.code ?? '') === '42501' || /permission denied/i.test(anonErr?.message ?? ''),
  `и это именно отказ в правах: ${anonErr?.code ?? '—'}`)

// ── внутренний путь через триггер уведомления — работает ──────────────────
const { data: linkedUser } = await service.from('profiles')
  .select('id').not('telegram_chat_id', 'is', null).limit(1).single()

if (linkedUser) {
  const before = (await service.from('magic_links').select('id', { count: 'exact', head: true })).count ?? 0
  await service.from('notifications').insert({
    user_id: linkedUser.id, type: 'order_status',
    title: 'Проверка аудита', body: 'magic link через триггер', link: '/profile/orders',
  })
  await new Promise(r => setTimeout(r, 1500))
  const after = (await service.from('magic_links').select('id', { count: 'exact', head: true })).count ?? 0
  check(after > before, `триггер уведомления по-прежнему строит magic link (${before} → ${after})`)

  await service.from('notifications').delete().eq('title', 'Проверка аудита')
  await service.from('magic_links').delete().eq('user_id', linkedUser.id)
}
else {
  console.log('⚠️  нет пользователя с привязанным Telegram — внутренний путь не проверен')
}

if (failed) process.exitCode = 1
