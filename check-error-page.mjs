/*
 * Страница ошибки: то, что видит человек, пришедший из поиска на снятый товар.
 *
 * Почему это проверяется. Замер боя 17 сентября 2026:
 *
 *  1. Ответ 404 отдавался то HTML, то JSON — в зависимости от заголовка
 *     `Accept`, — И КЕШИРОВАЛСЯ БЕЗ УЧЁТА ЭТОГО. На `/catalog/products/**`
 *     стоит `swr: 3600`, поэтому первый зашедший клиент определял, что целый
 *     час будут получать все остальные. Поймано на живом адресе:
 *     `/catalog/products/net-takogo-tovara-12345` отдавал браузеру
 *     `content-type: application/json` с `x-vercel-cache: HIT`, то есть
 *     человек видел `{"error": true, "statusCode": 404, …}` вместо страницы.
 *
 *  2. Даже когда приходил HTML — это была дефолтная страница Nuxt: «404 Товар
 *     не найден. Товар не найден. Go back home», с задвоенным текстом и
 *     английской ссылкой. Ни поиска, ни ссылок на разделы: тупик для того,
 *     кто пришёл по запросу вроде «xx2028».
 *
 * Стенд — сборка (dev-сервер рисует свою страницу ошибки):
 *   pnpm build && set -a && . ./.env && set +a && PORT=3127 node .output/server/index.mjs
 *   node check-error-page.mjs --base=http://localhost:3127
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const BROWSER = {
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
}

const strip = s => s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Уникальный адрес на каждый прогон: иначе проверяем чужой закешированный ответ. */
const uniq = () => `net-takogo-tovara-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

console.log('\n1) бот ходил первым — браузер всё равно получает страницу, а не JSON')
{
  const path = `/catalog/products/${uniq()}`
  // Сначала клиент без Accept: text/html — так ходят краулеры и мониторинги.
  const botRes = await fetch(`${BASE}${path}`, { headers: { accept: '*/*' } })
  const botType = botRes.headers.get('content-type') ?? ''
  const botBody = await botRes.text()
  check(botType.includes('text/html'), `клиенту без text/html в Accept отдано: ${botType.split(';')[0]}`)
  check(!botBody.trimStart().startsWith('{'), 'ему пришла не JSON-строка')

  const res = await fetch(`${BASE}${path}`, { headers: BROWSER })
  const type = res.headers.get('content-type') ?? ''
  const html = await res.text()
  check(res.status === 404, `код ответа ${res.status}`)
  check(type.includes('text/html'), `тип ответа браузеру: ${type.split(';')[0]}`)
  check(!html.trimStart().startsWith('{'), 'это не JSON')
}

console.log('\n2) закешированный ответ безвреден: он в любом случае разметка')
{
  /*
   * Сам факт кеширования ошибки не беда — беда была в том, ЧТО попадало в
   * кеш. Запретить кеширование не получается: рендерер Nuxt ставит 404-ым
   * `cache-control: no-cache` поверх заголовков, а платформа всё равно
   * кеширует по правилу маршрута. Поэтому проверяем не кеш, а формат.
   */
  const path = `/catalog/products/${uniq()}`
  const first = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } })
  const firstBody = await first.text()
  const second = await fetch(`${BASE}${path}`, { headers: BROWSER })
  const secondBody = await second.text()
  check(!firstBody.trimStart().startsWith('{'), 'первый зашедший получил разметку')
  check(!secondBody.trimStart().startsWith('{'), 'пришедший следом — тоже')
}

console.log('\n3) на странице есть чем воспользоваться')
{
  const res = await fetch(`${BASE}/catalog/products/${uniq()}`, { headers: BROWSER })
  const html = await res.text()
  const text = strip(html)

  check(/Страница не найдена|Товар не найден|не нашлась/i.test(text), `заголовок по-русски: «${text.slice(0, 60)}»`)
  check(!/Go back home/i.test(text), 'нет английской ссылки «Go back home»')
  check(/name="robots"[^>]*content="[^"]*noindex/.test(html), 'страница закрыта от индексации')

  const links = [...html.matchAll(/href="(\/[^"]*)"/g)].map(m => m[1])
  const toCatalog = links.filter(l => l.startsWith('/catalog'))
  check(toCatalog.length >= 3, `ссылок в каталог: ${toCatalog.length}`)
  check(links.includes('/'), 'есть ссылка на главную')
  check(/action="\/search"|href="\/search/.test(html), 'есть поиск по сайту')
}

console.log('\n4) 404 остаётся 404 на всех видах адресов')
for (const path of ['/catalog/nesushchestvuyushchiy-razdel', '/brand/net-takogo-brenda', '/sovsem-levyy-put']) {
  const res = await fetch(`${BASE}${path}`, { headers: BROWSER })
  const html = await res.text()
  check(res.status === 404 && !html.trimStart().startsWith('{'), `${res.status} и HTML: ${path}`)
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)
