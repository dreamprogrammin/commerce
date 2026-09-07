/**
 * Вопросы о товаре не должны отдавать анониму user_id; публичный список — через
 * is_mine, с именем автора. Аудит 7 сентября 2026.
 *   node check-questions-no-user-id.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const service = createClient(SUPA, SERVICE)
const anon = createClient(SUPA, ANON)
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

const { data: u } = await service.from('profiles').select('id').limit(1).single()
const { data: p } = await service.from('products').select('id').limit(1).single()
await service.from('product_questions').delete().eq('question_text', 'Проверка user_id?')
const { data: q } = await service.from('product_questions')
  .insert({ product_id: p.id, user_id: u.id, question_text: 'Проверка user_id?', is_published: true })
  .select('product_id').single()

const direct = await anon.from('product_questions').select('id, user_id').limit(1)
check(!!direct.error, `прямое чтение user_id анонимом отклонено: ${direct.error?.message ?? 'ПРОШЛО — ПЛОХО'}`)

const { data: list, error } = await anon.rpc('get_product_questions', { p_product_id: q.product_id })
check(!error && Array.isArray(list) && list.length > 0, `RPC отдаёт список: ${error?.message ?? list?.length + ' шт'}`)
const row = list?.[0] ?? {}
check(!('user_id' in row), 'user_id в ответе RPC отсутствует')
check('is_mine' in row && row.is_mine === false, `is_mine есть, для анона = false: ${row.is_mine}`)
check(!!row.profiles?.first_name, `имя автора отдаётся анониму: ${row.profiles?.first_name ?? '— (было пусто до фикса)'}`)

await service.from('product_questions').delete().eq('question_text', 'Проверка user_id?')
if (failed) process.exitCode = 1
