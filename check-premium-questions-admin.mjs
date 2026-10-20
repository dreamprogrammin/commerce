/**
 * generate-premium-questions — только администратору (20 октября 2026).
 *
 * Функция строит промпт из тела запроса и пишет ответ модели сервисным ключом
 * в публичные вопросы-ответы товаров, брендов и категорий. Раньше её мог
 * позвать кто угодно с публичным ключом из разметки сайта: потратить ключ
 * Anthropic и вписать на страницы магазина свой текст.
 *
 * Четыре вызова: без токена, с анонимным ключом, обычным пользователем и
 * администратором. Ключа Anthropic на стенде нет, поэтому администратор
 * доходит до «AI service not configured»: проверку он прошёл, а ни токенов,
 * ни записей в базе не тратится.
 *
 *   supabase start
 *   supabase functions serve --env-file <файл без ANTHROPIC_API_KEY>   ← без --no-verify-jwt
 *   set -a && . ./.env && set +a && node check-premium-questions-admin.mjs
 *
 * Администратору ЛОКАЛЬНОЙ базы ставится временный пароль (роль защищена
 * триггером, её не трогаем); обычный пользователь заводится и удаляется здесь.
 */
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const API = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!/127\.0\.0\.1|localhost/.test(API || '')) {
  console.error('ПРОВАЛ: страж заводит пользователей — только локальная база')
  process.exit(1)
}

const service = createClient(API, SERVICE, { auth: { persistSession: false } })
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

async function signIn(email, password) {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return (await res.json()).access_token
}

// Администратор локальной базы
const { data: adminProfile } = await service.from('profiles').select('id').eq('role', 'admin').limit(1).maybeSingle()
if (!adminProfile) {
  console.error('ПРОВАЛ: в локальной базе нет админа')
  process.exit(1)
}
const { data: { user: adminUser } } = await service.auth.admin.getUserById(adminProfile.id)
const adminPassword = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`
await service.auth.admin.updateUserById(adminProfile.id, { password: adminPassword })
const adminToken = await signIn(adminUser.email, adminPassword)

// Обычный пользователь — временный
const email = `premium-check-${Date.now()}@example.test`
const password = `Pw-${Math.random().toString(36).slice(2)}`
const { data: created } = await service.auth.admin.createUser({ email, password, email_confirm: true })
const userToken = await signIn(email, password)
const { data: userProfile } = await service.from('profiles').select('role').eq('id', created.user.id).maybeSingle()

check(Boolean(adminToken) && Boolean(userToken), `вошли: администратор и пользователь (роль «${userProfile?.role}»)`)

const { data: product } = await service.from('products').select('id, name').limit(1).single()
const body = JSON.stringify({ product_id: product.id, name: product.name, price: 60000, description: null })
const questions = async () => (await service.from('product_questions').select('id', { count: 'exact', head: true })).count
const before = await questions()

async function call(label, token, status, text) {
  const res = await fetch(`${API}/functions/v1/generate-premium-questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  })
  const answer = await res.text()
  check(res.status === status && (!text || answer.includes(text)), `${label}: ${res.status} ${answer.slice(0, 90)}`)
}

await call('без токена', null, 401)
await call('анонимный ключ из разметки сайта', ANON, 401, 'опознать')
await call('обычный пользователь', userToken, 403, 'только администратору')
await call('администратор — проверку прошёл', adminToken, 500, 'AI service not configured')
check(await questions() === before, `в вопросы-ответы ничего не записано (${before} → ${await questions()})`)

await service.auth.admin.deleteUser(created.user.id)
if (failed)
  process.exitCode = 1
