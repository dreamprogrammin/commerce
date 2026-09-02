/**
 * Проверка edge-функции generate-brand-seo на локальной базе.
 *
 * Anthropic API подменён заглушкой (ANTHROPIC_BASE_URL), поэтому проверяются
 * все звенья, кроме самой модели: права, сбор фактов, разбор ответа, чистка
 * разметки, предупреждения о длинах.
 *
 *   node scratchpad/mock-anthropic.mjs &
 *   supabase functions serve generate-brand-seo --env-file … --no-verify-jwt
 *   node check-brand-seo-fn.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPA = 'http://127.0.0.1:54321'
const FN = `${SUPA}/functions/v1/generate-brand-seo`
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const ADMIN_ID = 'cad0cf3c-f790-42a3-ae9d-b0fec109ebff'
const ADMIN_EMAIL = 'settings-check@example.com'
const PASSWORD = 'ProbaPassword123!'

const service = createClient(SUPA, SERVICE)

async function tokenFor(email, id) {
  await fetch(`${SUPA}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  const anon = createClient(SUPA, ANON)
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`вход ${email}: ${error.message}`)
  return data.session.access_token
}

async function call(token, body) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// бренды для проверки: один с текстом, один без
const { data: brands } = await service
  .from('brands')
  .select('id, slug, description')
  .in('slug', ['cada', 'rc-toys'])
const withText = brands.find(b => (b.description || '').trim())
const withoutText = brands.find(b => !(b.description || '').trim())

console.log('— без авторизации')
console.log('   ', (await call(null, { brand_ids: [withText.id] })).status, '(ожидаем 401)')

console.log('— с публичным анонимным ключом (так зовёт соседняя функция)')
console.log('   ', (await call(ANON, { brand_ids: [withText.id] })).status, '(ожидаем 401)')

const { data: plain } = await service.from('profiles').select('id, role').neq('role', 'admin').limit(1)
if (plain?.length) {
  const { data: u } = await service.auth.admin.getUserById(plain[0].id)
  if (u?.user?.email) {
    const token = await tokenFor(u.user.email, plain[0].id)
    const r = await call(token, { brand_ids: [withText.id] })
    console.log('— обычный пользователь:', r.status, r.body?.error, '(ожидаем 403)')
  }
}

const adminToken = await tokenFor(ADMIN_EMAIL, ADMIN_ID)

console.log('— админ, пустой запрос')
console.log('   ', JSON.stringify(await call(adminToken, {})))

console.log('— админ, слишком много брендов')
console.log('   ', JSON.stringify(await call(adminToken, { brand_ids: Array.from({ length: 9 }, () => withText.id) })))

console.log('\n— админ, два бренда (один с текстом, один без)')
const ok = await call(adminToken, { brand_ids: [withText.id, withoutText.id] })
console.log('   код', ok.status)
for (const item of ok.body?.brands ?? []) {
  console.log(`   ${item.brand_slug}:`)
  console.log(`      title (${item.meta_title.length}): ${item.meta_title}`)
  console.log(`      h1: ${item.seo_h1}`)
  console.log(`      описание: ${item.seo_description}`)
  console.log(`      текст: ${item.description ? JSON.stringify(item.description) : '— (у бренда свой)'}`)
  console.log(`      замечания: ${item.warnings.join(' | ') || '—'}`)
}
console.log('   расход:', JSON.stringify(ok.body?.usage))
