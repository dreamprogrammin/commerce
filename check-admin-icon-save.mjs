/*
 * Админка чинит битые имена иконок при сохранении.
 *
 * Почему это проверяется. 21 сентября 2026 пустые иконки нашлись на 102
 * карточках товаров из 178 и в текстах разделов, брендов, линеек: в data-icon
 * стояли имена, которых нет в коллекции. С тех пор сторы админки перед
 * записью прогоняют тексты через composables/admin/useIconNameGuard.ts.
 * Этот страж сохраняет товар с двумя битыми именами через НАСТОЯЩИЙ стор в
 * живом браузере под сессией админа и смотрит, что легло в базу.
 *
 * Без правки (проверено: сторы откачены, сборка) битые имена ложатся как
 * есть, предупреждения нет; с правкой — `direct-hit` → `bullseye`,
 * выдуманное → `sparkles`, правильная иконка не тронута.
 *
 * ПИШЕТ В БАЗУ — только ЛОКАЛЬНУЮ, и возвращает описание на место. Роль
 * админа защищена триггером protect_profile_role_update, поэтому берётся
 * существующий админ локальной базы, ему выдаётся пароль (рецепт — в
 * памяти проекта browser-check-behind-login).
 *
 *   supabase start; pnpm build
 *   set -a && . ./.env && set +a && PORT=3127 node .output/server/index.mjs
 *   set -a && . ./.env && set +a && node check-admin-icon-save.mjs
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
if (!/localhost|127\.0\.0\.1/.test(BASE) || !/127\.0\.0\.1|localhost/.test(process.env.SUPABASE_URL || '')) {
  console.error('ПРОВАЛ: страж пишет в базу — только локальный стенд и локальная база')
  process.exit(1)
}
const API = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const PRODUCT = null // берётся ниже: любой товар с иконками в описании
const sql = q => execFileSync('docker', ['exec', 'supabase_db_gvsdevsvzgcivpphcuai', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q], { encoding: 'utf8' }).trim()

// 1. существующий админ ЛОКАЛЬНОЙ базы — роль защищена триггером, её не трогаем
const uid = sql(`SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1`)
if (!uid) {
  console.error('ПРОВАЛ: в локальной базе нет админа')
  process.exit(1)
}
const productId = sql(`SELECT id FROM public.products WHERE description LIKE '%data-icon=%' ORDER BY created_at LIMIT 1`)
const email = sql(`SELECT email FROM auth.users WHERE id = '${uid}'`)
const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`
await fetch(`${API}/auth/v1/admin/users/${uid}`, { method: 'PUT', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
console.log(`вход под админом локальной базы: роль ${sql(`SELECT role FROM public.profiles WHERE id = '${uid}'`)}`)

const tok = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()
const jar = []
const ssr = createServerClient(API, ANON, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => jar, setAll: list => { for (const c of list) { const i = jar.findIndex(x => x.name === c.name); i >= 0 ? jar.splice(i, 1, c) : jar.push(c) } } } })
await ssr.auth.setSession({ access_token: tok.access_token, refresh_token: tok.refresh_token })

// 2. исходное описание — вернём в конце
const original = sql(`SELECT description FROM public.products WHERE id = '${productId}'`)
const broken = `<h2 data-icon="fluent-emoji-flat:direct-hit">Проверка известной ошибки</h2><ul><li data-icon="fluent-emoji-flat:unicorn-made-up">Проверка выдуманного имени</li><li data-icon="fluent-emoji-flat:rocket">Правильная иконка</li></ul>`

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
const page = await ctx.newPage()
try {
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForTimeout(3000)
  console.log(`админка открылась: ${page.url().replace(BASE, '')}`)

  // 3. сохраняем через настоящий стор — тот же код, что вызывает форма
  const res = await page.evaluate(async ({ id, html }) => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const store = pinia._s.get('adminProductsStore')
    if (!store)
      return { error: 'стор adminProductsStore ещё не создан на этой странице' }
    const out = await store.updateProduct(id, { description: html }, [], [], [])
    return { ok: !!out }
  }, { id: productId, html: broken })
  console.log(`вызов updateProduct: ${JSON.stringify(res)}`)

  await page.waitForTimeout(800)
  const toastText = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => [])
  console.log(`уведомления: ${toastText.map(t => t.replace(/\s+/g, ' ').slice(0, 140)).join(' | ') || '—'}`)
  await page.screenshot({ path: `${process.env.SC || (await import('node:os')).tmpdir()}/admin-icon-toast.png` })

  // 4. что легло в базу
  const saved = sql(`SELECT description FROM public.products WHERE id = '${productId}'`)
  console.log(`\nв базе после сохранения:\n  ${saved}`)
  console.log(`\n  direct-hit ушёл → bullseye:  ${!saved.includes('direct-hit') && saved.includes('fluent-emoji-flat:bullseye')}`)
  console.log(`  выдуманное → sparkles:       ${!saved.includes('unicorn-made-up') && saved.includes('fluent-emoji-flat:sparkles')}`)
  console.log(`  правильная не тронута:       ${saved.includes('fluent-emoji-flat:rocket')}`)
  const warned = toastText.some(t => t.includes('Иконки в тексте поправлены'))
  console.log(`  человеку показано предупреждение: ${warned}`)
  process.exitCode = (!saved.includes('direct-hit') && saved.includes('fluent-emoji-flat:bullseye') && saved.includes('fluent-emoji-flat:sparkles') && !saved.includes('unicorn-made-up') && saved.includes('fluent-emoji-flat:rocket') && warned) ? 0 : 1
  console.log(process.exitCode ? '\nПРОВАЛ' : '\nвсё зелено')
}
finally {
  sql(`UPDATE public.products SET description = $$${original}$$ WHERE id = '${productId}'`)
  console.log(`\n(исходное описание возвращено: ${sql(`SELECT description = $$${original}$$ FROM public.products WHERE id = '${productId}'`)})`)
  await browser.close()
}
