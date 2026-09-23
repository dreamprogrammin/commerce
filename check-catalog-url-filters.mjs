/*
 * Фильтры каталога из адреса не теряются — ни при заходе, ни при переходе.
 *
 * Почему это проверяется (23 сентября 2026). Страницы каталога отдаются через
 * ISR, и сервер строит их без query; при переходе внутри сайта Nuxt берёт
 * `_payload.json` того же пути — тоже без query. Снимок фильтров с сервера
 * затирал фильтры, прочитанные из адреса: на бою `/catalog/kiddy?materials=3`
 * — первый запрос товаров с материалом, второй уже без него. А выбранный
 * вариант атрибута никогда не выглядел отмеченным: выбор хранится строками,
 * `option.id` — число.
 *
 *   node check-catalog-url-filters.mjs --base=http://localhost:3129
 *
 * Только чтение. Нужен раздел с фильтром по атрибуту: берётся «Питание» у
 * радиоуправляемых машинок; нет его — проверяется только материал.
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const RC = '/catalog/boys/mashinki/radioupravlyaemye-mashinki'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

// Номер варианта «Аккумулятор» и материала «Текстиль» — из базы, ключом со страницы
const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || home.match(/"(https?:\/\/[^"]+supabase\.co)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
const rest = async path => (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
const [accum] = await rest('attribute_options?select=id,attributes!inner(slug)&value=eq.Аккумулятор&attributes.slug=eq.pitanie')
const [textile] = await rest('materials?select=id&name=eq.Текстиль')

/** Последний запрос товаров: что в нём было и сколько пришло. */
function watchProducts(page) {
  const calls = []
  page.on('response', async (r) => {
    if (!r.url().includes('rpc/get_filtered_products'))
      return
    const body = r.request().postData() ?? ''
    const n = await r.json().then(j => (Array.isArray(j) ? j.length : -1)).catch(() => -1)
    calls.push({ body, n })
  })
  return calls
}

const browser = await chromium.launch()
try {
  // ── 1) прямой заход с материалом ──────────────────────────────────────────
  console.log(`сайт ${BASE}\n\n1) прямой заход: /catalog/kiddy?materials=${textile?.id}`)
  if (textile) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
    const calls = watchProducts(page)
    await page.goto(`${BASE}/catalog/kiddy?materials=${textile.id}`, { waitUntil: 'load' })
    await page.waitForTimeout(6000)
    // Локально (без ISR) сервер строит страницу уже с фильтром, и браузер
    // товары не перезапрашивает; на бою (ISR) — перезапрашивает. Ломалось
    // одно: второй запрос уходил БЕЗ материала. Его и ловим.
    const dropped = calls.filter(c => !c.body.includes(`"p_material_ids":["${textile.id}"]`))
    check(dropped.length === 0, `запросов товаров без материала: ${dropped.length} (${calls.map(c => (c.body.includes('p_material_ids":["') ? 'с материалом' : 'без')).join(', ') || 'браузер не перезапрашивал'})`)
    check(page.url().includes(`materials=${textile.id}`), 'фильтр остался в адресе')
    await page.close()
  }

  // ── 2) переход внутри сайта на адрес с атрибутом ──────────────────────────
  if (accum) {
    console.log(`\n2) переход внутри сайта: ${RC}?attr_pitanie=${accum.id} — пять раз`)
    let good = 0
    for (let i = 1; i <= 5; i++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
      await page.goto(`${BASE}/catalog/kiddy`, { waitUntil: 'load' })
      await page.waitForTimeout(1500 + i * 300)
      const calls = watchProducts(page)
      await page.evaluate((to) => {
        const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties
        nuxt.$router.push(to)
      }, `${RC}?attr_pitanie=${accum.id}`)
      await page.waitForTimeout(5000)
      const last = calls.at(-1)
      const applied = !!last && /"p_attributes":\[\{"slug":"pitanie"/.test(last.body)
      if (applied)
        good++
      if (i === 5) {
        await page.locator('button').filter({ hasText: /^\s*Питание/ }).first().click()
        await page.waitForTimeout(600)
        const boxes = await page.locator('[role="dialog"]').last().evaluate(el => [...el.querySelectorAll('[role="checkbox"]')].map(x => ({ on: x.getAttribute('aria-checked') === 'true', label: x.parentElement?.textContent?.trim() })))
        check(boxes.some(b => b.on && b.label === 'Аккумулятор'), `в панели «Аккумулятор» отмечен (${boxes.map(b => `${b.on ? '☑' : '☐'} ${b.label}`).join(', ')})`)
        await page.locator('[role="dialog"]').last().locator('[role="checkbox"]').first().click()
        await page.waitForTimeout(2500)
        check(!page.url().includes('attr_pitanie'), 'галочка снимается — фильтр уходит из адреса')
      }
      await page.close()
    }
    check(good === 5, `фильтр применён при переходе: ${good} из 5`)
  }
  else {
    console.log('\n2) атрибута «Питание» с «Аккумулятором» в базе нет — пропуск')
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)
