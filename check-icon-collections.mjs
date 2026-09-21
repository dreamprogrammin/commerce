/*
 * Иконки: список коллекций узкий, и все иконки при этом рисуются.
 *
 * Почему это проверяется. В @nuxt/icon 2.1.0 каждая иконка при создании
 * вызывает useResolvedName(), а та делает
 *   (options.collections || []).sort((a, b) => b.length - a.length)
 * — сортировку НА МЕСТЕ реактивного массива из useAppConfig(). Без настройки
 * `icon.collections` в этом массиве все 178 коллекций Iconify, и каждая
 * перестановка идёт через ловушки реактивности Vue. Замер 21 сентября 2026
 * (js-cpu-by-package.mjs, эмуляция телефона /4): useResolvedName — 39 мс на
 * загрузке главной, а в верхушке боевого профиля стояли get/set по ~45 мс.
 *
 * Сам список нужен библиотеке только затем, чтобы разбирать имена через
 * дефис (`simple-icons-github` → `simple-icons:github`). На сайте все 662
 * имени пишутся через двоеточие, и в базе тоже (categories.icon_name пуст,
 * data-icon в описаниях — только fluent-emoji-flat:*). Поэтому сузить его до
 * своих коллекций безопасно — а вторая половина проверки это подтверждает:
 * каждая иконка на странице получила маску или фон.
 *
 * Стенд — сборка:
 *   pnpm build && set -a && . ./.env && set +a && PORT=3127 node .output/server/index.mjs
 *   node check-icon-collections.mjs --base=http://localhost:3127
 * Против боя: node check-icon-collections.mjs --base=https://uhti.kz
 */
import process from 'node:process'
import { chromium, devices } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const MAX_COLLECTIONS = 15

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

console.log('\n1) список коллекций в клиентском JavaScript')
{
  const html = await (await fetch(`${BASE}/`)).text()
  const scripts = [...new Set([...html.matchAll(/\/_nuxt\/[\w-]+\.js/g)].map(m => m[0]))]
  let found = null
  for (const s of scripts) {
    const js = await (await fetch(`${BASE}${s}`)).text()
    const m = js.match(/collections:\[((?:"[^"]*",?)*)\]/)
    if (m && m[1].includes('"')) {
      found = m[1].split(',').map(x => x.replace(/"/g, '')).filter(Boolean)
      break
    }
  }
  check(found !== null, `список найден (${scripts.length} файлов просмотрено)`)
  if (found)
    check(found.length <= MAX_COLLECTIONS, `коллекций ${found.length} (ждём не больше ${MAX_COLLECTIONS}): ${found.slice(0, 5).join(', ')}${found.length > 5 ? '…' : ''}`)
}

console.log('\n2) все иконки на страницах нарисованы')
const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'] })
for (const path of ['/', '/catalog/girls/kukly', '/catalog/products/konstruktor-lego-city-60415-pogonya-za-policeyskoy-mashinoy-i-muskul-karom-policiya-protiv-grabiteley']) {
  const page = await context.newPage()
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 180000 })
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => {
    const els = [...document.querySelectorAll('span.iconify')]
    const blank = els.filter((el) => {
      const cs = getComputedStyle(el)
      const painted = (cs.maskImage && cs.maskImage !== 'none')
        || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')
        || (cs.backgroundImage && cs.backgroundImage !== 'none')
      return !painted
    })
    return { total: els.length, blank: blank.length, sample: blank.map(el => el.className) }
  })
  check(r.total > 0, `${path.slice(0, 40)}: иконок на странице ${r.total}`)

  /*
   * Пустая иконка бывает по двум причинам, и их надо развести. Если имя не
   * существует в коллекции — это данные: на 21 сентября 2026 в описаниях
   * товаров пять таких имён (`direct-hit`, `gem`, `superhero`, `dinosaur`,
   * `treasure-chest`), пусто на 102 карточках из 178. Это не провал этой
   * проверки. Провал — если сервер иконку знает, а на странице она пустая:
   * вот это и значило бы, что сужение списка коллекций что-то сломало.
   */
  let broken = 0
  const badData = []
  for (const cls of r.sample) {
    const name = (cls.match(/i-([a-z0-9-]+):([a-z0-9-]+)/) || [])
    if (!name[1])
      continue
    const api = await (await fetch(`${BASE}/api/_nuxt_icon/${name[1]}.json?icons=${name[2]}`)).json().catch(() => ({}))
    if (api?.icons?.[name[2]])
      broken++
    else
      badData.push(`${name[1]}:${name[2]}`)
  }
  check(broken === 0, `    пустых при существующем имени: ${broken}`)
  if (badData.length)
    console.log(`  (к сведению) пустые из-за несуществующего имени в данных: ${[...new Set(badData)].join(', ')}`)
  await page.close()
}
await browser.close()

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)
