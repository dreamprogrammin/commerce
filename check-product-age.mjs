/*
 * Возраст товара в месяцах — карточки и админка.
 *
 * Почему это проверяется (22 сентября 2026). Возраст хранился целыми годами,
 * и игрушку «от 6 месяцев» можно было записать только как «от 1 года»: так
 * лежали 8 малышовых товаров, а карточка писала «от 1 лет». Теперь в базе
 * месяцы (миграция 20260922120000_product_age_in_months), в админке — число
 * и единица «мес. / лет», на сайте — «от 6 месяцев», «от 1 года», «от 3 лет».
 *
 *   node check-product-age.mjs --base=http://localhost:3129
 *     карточки: возраст словами как в описании, нигде нет «от 1 лет».
 *     Только чтение, годится и для боя.
 *
 *   set -a && . ./.env && set +a && node check-product-age.mjs --base=http://localhost:3129 --admin
 *     плюс админка: у пирамидки поле показывает «6 мес.», вводим «3 лет»,
 *     сохраняем кнопкой формы и смотрим, что легло в базу. ПИШЕТ В БАЗУ —
 *     только ЛОКАЛЬНУЮ, в конце возвращает 6 месяцев.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const ADMIN = process.argv.includes('--admin')

const PYRAMID = 'e8c320d1-2fc8-415c-9b73-cbb77f73cd84'
// Товары, у которых возраст в описании указан месяцами, — и как его должна
// назвать карточка (docs/PRODUCT_AGE_MONTHS_2026_09_22.sql).
const EXPECTED = {
  [PYRAMID]: 'от 6 месяцев',
  'a236076a-f146-4d34-9fb5-e8721b71b938': 'от 9 месяцев',
  'dade5c34-f42b-4a9c-950b-e205edfc5f52': 'от 18 месяцев',
  'f98da138-2aa9-441d-933f-2e914d3198fa': 'от 18 месяцев до 8 лет',
}
const WRONG = /\bот (?:1|21|31) лет\b|\bот 1 лет\b/

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ')
}

// Адрес базы и публичный ключ — со страницы сайта, как видит их покупатель
const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || home.match(/"(https?:\/\/[^"]+supabase\.co)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
if (!supaUrl || !anon) {
  console.log(' ПРОВАЛ  не нашёл на странице адрес базы или публичный ключ')
  process.exit(1)
}
const res = await fetch(`${supaUrl}/rest/v1/products?select=id,slug,min_age_months,max_age_months&is_active=eq.true`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })
const products = await res.json()
console.log(`сайт ${BASE}\n\n1) база`)
check(res.ok && Array.isArray(products), res.ok ? `колонки с месяцами есть, активных товаров ${products.length}` : `колонок с месяцами нет — миграция не применена (${res.status})`)
if (!res.ok) {
  console.log(`\nКРАСНЫЙ: ${fails.length} провал(ов)`)
  process.exit(1)
}

console.log('\n2) карточки: возраст как в описании')
for (const [id, text] of Object.entries(EXPECTED)) {
  const p = products.find(x => x.id === id)
  if (!p) {
    check(false, `${id}: товара нет среди активных`)
    continue
  }
  const html = await (await fetch(`${BASE}/catalog/products/${p.slug}`)).text()
  const visible = visibleText(html)
  check(visible.includes(text), `${p.slug.slice(0, 50)}: «${text}»${visible.includes(text) ? '' : ` — в базе ${p.min_age_months}–${p.max_age_months} мес.`}`)
}

console.log('\n3) нигде нет «от 1 лет» — по одной карточке на каждый возраст')
const seen = new Set()
for (const p of products) {
  const key = `${p.min_age_months}-${p.max_age_months}`
  if (seen.has(key))
    continue
  seen.add(key)
  const visible = visibleText(await (await fetch(`${BASE}/catalog/products/${p.slug}`)).text())
  const bad = visible.match(WRONG)
  check(!bad, `${key.padEnd(10)} мес.: ${p.slug.slice(0, 50)}${bad ? ` — «${bad[0]}»` : ''}`)
}

if (ADMIN) {
  console.log('\n4) админка: число и единица, в базу — месяцы')
  if (!/localhost|127\.0\.0\.1/.test(BASE) || !/127\.0\.0\.1|localhost/.test(process.env.SUPABASE_URL || '')) {
    check(false, 'админка пишет в базу — только локальный стенд и локальная база')
  }
  else {
    const { createServerClient } = await import('@supabase/ssr')
    const API = process.env.SUPABASE_URL
    const ANON = process.env.SUPABASE_KEY
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
    const sql = q => execFileSync('docker', ['exec', 'supabase_db_gvsdevsvzgcivpphcuai', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', q], { encoding: 'utf8' }).trim()

    const uid = sql(`SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1`)
    const email = sql(`SELECT email FROM auth.users WHERE id = '${uid}'`)
    const password = `Pw-${Math.random().toString(36).slice(2)}-${Date.now()}`
    await fetch(`${API}/auth/v1/admin/users/${uid}`, { method: 'PUT', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }, body: JSON.stringify({ password }) })
    const tok = await (await fetch(`${API}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()
    const jar = []
    const ssr = createServerClient(API, ANON, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => jar, setAll: (list) => {
      for (const c of list) {
        const i = jar.findIndex(x => x.name === c.name)
        i >= 0 ? jar.splice(i, 1, c) : jar.push(c)
      }
    } } })
    await ssr.auth.setSession({ access_token: tok.access_token, refresh_token: tok.refresh_token })

    const before = sql(`SELECT min_age_months || '/' || min_age_years FROM public.products WHERE id = '${PYRAMID}'`)
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })))
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
      }
      catch {}
    })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/admin/products/${PYRAMID}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      const input = page.locator('#min_age')
      await input.waitFor({ timeout: 60000 })
      await page.waitForTimeout(1500)
      const block = input.locator('xpath=ancestor::div[contains(@class,"grid")][1]/..')
      const unit = await input.locator('xpath=following-sibling::*[1]').innerText()
      check(await input.inputValue() === '6' && unit.trim() === 'мес.', `у пирамидки поле показывает «${await input.inputValue()} ${unit.trim()}» (база ${before} мес./лет)`)
      const hint = await block.innerText()
      check(hint.includes('На сайте: от 6 месяцев'), 'подсказка «На сайте: от 6 месяцев»')
      await block.screenshot({ path: 'product-age-admin-before.png' })

      // вводим как для игрушки «от 3 лет»
      await input.fill('3')
      await input.locator('xpath=following-sibling::*[1]').click()
      await page.getByRole('option', { name: 'лет' }).click()
      await page.waitForTimeout(300)
      check((await block.innerText()).includes('На сайте: от 3 лет'), 'после «3» и «лет» подсказка «На сайте: от 3 лет»')
      await block.screenshot({ path: 'product-age-admin-after.png' })

      await page.getByRole('button', { name: 'Сохранить изменения' }).click()
      let saved = ''
      for (let i = 0; i < 40 && saved !== '36/3'; i++) {
        await page.waitForTimeout(500)
        saved = sql(`SELECT min_age_months || '/' || min_age_years FROM public.products WHERE id = '${PYRAMID}'`)
      }
      check(saved === '36/3', `сохранение формой: в базе ${saved} мес./лет (ждали 36/3)`)
    }
    finally {
      await browser.close()
      sql(`UPDATE public.products SET min_age_months = 6 WHERE id = '${PYRAMID}'`)
      console.log(`  возвращено: ${sql(`SELECT min_age_months || '/' || min_age_years FROM public.products WHERE id = '${PYRAMID}'`)} мес./лет`)
    }
  }
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)
