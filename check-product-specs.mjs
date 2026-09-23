/*
 * Характеристики товара: карточка, фильтры каталога, автозаполнение в админке.
 *
 * Почему это проверяется (23 сентября 2026). Характеристики (питание,
 * эффекты, вид техники, цвет, частота, масштаб) заведены по просьбе
 * владельца — «как на карточках „Детского мира“, со ссылками и чтобы при
 * добавлении товара заполнялись сами». По дороге нашлись две старые ошибки
 * каталога: выбранный вариант фильтра никогда не выглядел отмеченным
 * (строка против числа), а панель показывала все варианты атрибута, даже
 * те, которых в разделе нет ни у одного товара.
 *
 *   node check-product-specs.mjs --base=http://localhost:3129
 *     1) карточка танка: строки характеристик со ссылками на раздел с
 *        фильтром, те же значения в разметке additionalProperty;
 *     2) по ссылке «Питание» выдача отфильтрована, галочка отмечена и
 *        снимается; в фильтре только варианты, которые есть в разделе.
 *     Только чтение, годится и для боя (после SQL и выкатки фронта).
 *
 *   set -a && . ./.env && set +a && node check-product-specs.mjs --base=http://localhost:3129 --admin
 *     3) админка: новый товар — характеристики подставляются из названия и
 *        описания с подсказкой «Из описания: …»; товар НЕ сохраняется.
 *     Нужен вход под админом ЛОКАЛЬНОЙ базы.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const ADMIN = process.argv.includes('--admin')
const RC = '/catalog/boys/mashinki/radioupravlyaemye-mashinki'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const browser = await chromium.launch()
try {
  // ── 1) карточка ────────────────────────────────────────────────────────────
  console.log(`сайт ${BASE}\n\n1) карточка радиоуправляемого танка`)
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const hydration = []
  page.on('console', m => /Hydration|mismatch/i.test(m.text()) && hydration.push(m.text()))
  // Адрес карточки — из базы, публичным ключом со страницы сайта
  const home = await (await fetch(`${BASE}/`)).text()
  const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || home.match(/"(https?:\/\/[^"]+supabase\.co)"/) || [])[1]
  const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
  const found = supaUrl && anon
    ? await (await fetch(`${supaUrl}/rest/v1/products?select=slug&is_active=eq.true&name=ilike.*M1A2%202033*&order=name&limit=1`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
    : []
  const tankHref = found[0]?.slug ? `/catalog/products/${found[0].slug}` : null
  check(!!tankHref, `в базе нашлась карточка танка${tankHref ? '' : ' — нет'}`)
  if (tankHref) {
    await page.goto(`${BASE}${tankHref}`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.pdp-spec-row')].map((r) => {
      const label = r.querySelector('dt')?.textContent?.trim() ?? ''
      const a = r.querySelector('dd a')
      return [label, { value: r.querySelector('dd')?.textContent?.trim(), href: a?.getAttribute('href') ?? null }]
    })))
    check(rows['Вид техники']?.value === 'Танк', `«Вид техники: Танк» (${rows['Вид техники']?.value ?? 'нет строки'})`)
    check(rows['Питание']?.value === 'Аккумулятор', `«Питание: Аккумулятор» (${rows['Питание']?.value ?? 'нет строки'})`)
    check(/[?&]attr_pitanie=\d+/.test(rows['Питание']?.href ?? '') && (rows['Питание']?.href ?? '').startsWith(RC), `ссылка «Питание» — раздел с фильтром: ${rows['Питание']?.href}`)
    check(!!rows['Световые эффекты'] && !!rows['Звуковые эффекты'], 'строки световых и звуковых эффектов есть')
    check(/[?&]materials=\d+/.test(rows['Материал']?.href ?? ''), `материал — ссылкой с фильтром: ${rows['Материал']?.href}`)
    const ld = await page.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join(' '))
    check(/"name":"Питание","value":"Аккумулятор"/.test(ld), 'в разметке additionalProperty то же «Питание: Аккумулятор»')
    check(!hydration.length, `гидратация без расхождений${hydration.length ? ` — ${hydration[0]}` : ''}`)

    // ── 2) переход по ссылке и фильтр ────────────────────────────────────────
    console.log('\n2) переход по «Питание» и панель фильтров')
    const rpc = []
    page.on('response', async (r) => {
      if (r.url().includes('rpc/get_filtered_products'))
        rpc.push({ body: r.request().postData() ?? '', n: await r.json().then(j => (Array.isArray(j) ? j.length : -1)).catch(() => -1) })
    })
    await page.locator('.pdp-spec-row').filter({ hasText: 'Питание' }).locator('a').first().click()
    await page.waitForTimeout(6000)
    check(/attr_pitanie=/.test(page.url()), `адрес с фильтром: ${page.url().replace(BASE, '')}`)
    const last = rpc.at(-1)
    check(!!last && /"p_attributes":\[\{"slug":"pitanie"/.test(last.body), `выдача запрошена с фильтром по питанию (${last ? `${last.n} товаров` : 'запроса нет'})`)

    const openFilter = async (name) => {
      await page.locator('button').filter({ hasText: new RegExp(`^\\s*${name}`) }).first().click()
      await page.waitForTimeout(600)
      return page.locator('[role="dialog"]').last()
    }
    const pop = await openFilter('Питание')
    const options = await pop.evaluate(el => [...el.querySelectorAll('[role="checkbox"]')].map(x => ({ checked: x.getAttribute('aria-checked') === 'true', label: x.parentElement?.textContent?.trim() })))
    check(options.some(o => o.checked && o.label === 'Аккумулятор'), `в фильтре «Аккумулятор» отмечен (${options.map(o => `${o.checked ? '☑' : '☐'} ${o.label}`).join(', ')})`)
    check(!options.some(o => o.label === 'Без батареек'), 'варианта «Без батареек» в разделе нет — и в фильтре нет')
    await pop.locator('[role="checkbox"]').first().click()
    await page.waitForTimeout(2500)
    check(!/attr_pitanie=/.test(page.url()), 'галочка снимается — фильтр ушёл из адреса')
    await page.keyboard.press('Escape')
  }
  await page.close()

  // ── 3) админка ─────────────────────────────────────────────────────────────
  if (ADMIN) {
    console.log('\n3) админка: новый товар')
    if (!/localhost|127\.0\.0\.1/.test(BASE) || !/127\.0\.0\.1|localhost/.test(process.env.SUPABASE_URL || '')) {
      check(false, 'админка — только локальный стенд и локальная база')
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
      const productsBefore = sql('SELECT count(*) FROM public.products')

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
      await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' })))
      const admin = await ctx.newPage()
      await admin.goto(`${BASE}/admin/products/new`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await admin.locator('#name').waitFor({ timeout: 60000 })
      await admin.waitForTimeout(1500)
      await admin.locator('#name').fill('Радиоуправляемый джип красный — 1:16, пульт 2.4G, аккумулятор')
      await admin.locator('#description').fill('Работает от аккумулятора с USB зарядкой. Световые эффекты фар и звук мотора.')
      // раздел
      await admin.locator('button').filter({ hasText: 'Выберите категорию' }).first().click()
      await admin.getByRole('option', { name: 'Радиоуправляемые машинки', exact: true }).click()
      await admin.waitForTimeout(3000)
      // Поля карточки «Характеристики»: подпись, выбранное значение, подсказка
      const fields = await admin.evaluate(() => {
        let box = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Заполнить из описания')) ?? null
        while (box && box.querySelectorAll('button[role="combobox"]').length === 0)
          box = box.parentElement
        return [...(box?.querySelectorAll('label') ?? [])].map((l) => {
          const wrap = l.parentElement
          return {
            label: l.textContent?.trim(),
            value: wrap?.querySelector('button[role="combobox"]')?.textContent?.trim(),
            hint: [...(wrap?.querySelectorAll('p') ?? [])].map(p => p.textContent?.trim() ?? '').find(t => t.startsWith('Из описания')),
          }
        })
      })
      const get = label => fields.find(f => f.label === label)
      for (const [label, expected] of [['Вид техники', 'Внедорожник'], ['Питание', 'Аккумулятор'], ['Масштаб', '1:16'], ['Частота управления', '2,4 ГГц'], ['Световые эффекты', 'Есть'], ['Звуковые эффекты', 'Есть'], ['Цвет', 'Красный']])
        check(get(label)?.value === expected && !!get(label)?.hint, `${label}: «${get(label)?.value ?? '—'}»${get(label)?.hint ? ' · с подсказкой «Из описания»' : ' · без подсказки'}`)
      // Тип — у кукол свой атрибут: «Тип куклы»
      await admin.goto(`${BASE}/admin/products/new`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await admin.locator('#name').waitFor({ timeout: 60000 })
      await admin.waitForTimeout(1500)
      await admin.locator('#name').fill('Кукла шарнирная DEFA Lucy 9999 — 29 см, питомец и аксессуары')
      await admin.locator('button').filter({ hasText: 'Выберите категорию' }).first().click()
      await admin.getByRole('option', { name: 'Куклы для девочек', exact: true }).click()
      await admin.waitForTimeout(3000)
      const dollType = await admin.evaluate(() => {
        let box = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Заполнить из описания')) ?? null
        while (box && box.querySelectorAll('button[role="combobox"]').length === 0)
          box = box.parentElement
        const label = [...(box?.querySelectorAll('label') ?? [])].find(l => l.textContent?.trim() === 'Тип куклы')
        return label?.parentElement?.querySelector('button[role="combobox"]')?.textContent?.trim() ?? null
      })
      check(dollType === 'Шарнирная кукла', `новая кукла: «Тип куклы» — «${dollType ?? 'поля нет'}»`)

      check(sql('SELECT count(*) FROM public.products') === productsBefore, 'товары не сохранялись')
      await ctx.close()
    }
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)
