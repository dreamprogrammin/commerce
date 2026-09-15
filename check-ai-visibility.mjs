/*
 * Видимость для ИИ-поисковиков: доступ краулерам, факты в машиночитаемом
 * виде, сущность магазина в разметке.
 *
 * Зачем. Ответ ChatGPT, Perplexity или Google AI собирается из страниц,
 * которые их краулер смог забрать и понять. Проверяем ровно это, а не
 * догадки: отвечает ли сайт их агентам, лежит ли текст в СЕРВЕРНОЙ разметке
 * (JS они не ждут), названы ли они в robots.txt, есть ли короткий свод
 * условий в `/llms.txt` и опознаётся ли магазин как сущность.
 *
 *   node check-ai-visibility.mjs --base=http://localhost:3008
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3008'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const AGENTS = [
  'GPTBot/1.2',
  'OAI-SearchBot/1.0',
  'ChatGPT-User/1.0',
  'PerplexityBot/1.0',
  'ClaudeBot/1.0',
  'Google-Extended',
  'Bingbot/2.0',
]

// ---------- 1. Краулеры получают готовую страницу ----------
console.log('\n1) доступ краулерам ИИ')
for (const ua of AGENTS) {
  const response = await fetch(`${BASE}/brand/lego`, { headers: { 'user-agent': ua } })
  const html = await response.text()
  const hasText = html.includes('Конструкторы LEGO в Алматы')
  const hasFaq = html.includes('Где купить оригинальный LEGO в Алматы')
  check(
    response.status === 200 && hasText && hasFaq,
    `${ua}: ${response.status}, текст ${hasText ? 'на месте' : 'ОТСУТСТВУЕТ'}, вопросы ${hasFaq ? 'на месте' : 'ОТСУТСТВУЮТ'}`,
  )
}

// ---------- 2. robots.txt называет их поимённо ----------
{
  console.log('\n2) robots.txt')
  const robots = await (await fetch(`${BASE}/robots.txt`)).text()
  const named = ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']
  const missing = named.filter(ua => !new RegExp(`User-agent:\\s*${ua}\\b`, 'i').test(robots))
  check(missing.length === 0, missing.length === 0
    ? `названы поимённо: ${named.join(', ')}`
    : `не названы: ${missing.join(', ')}`)
  check(!/User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/m.test(robots), 'общего запрета `Disallow: /` нет')

  const header = (await fetch(`${BASE}/brand/lego`)).headers.get('x-robots-tag') ?? ''
  check(/index/.test(header) && !/noindex/.test(header), `заголовок страницы: ${header || 'нет'}`)
}

// ---------- 3. llms.txt со сводом условий ----------
{
  console.log('\n3) llms.txt')
  /*
   * HEAD проверяется отдельно и первым. На бою 15 сентября 2026 `GET`
   * отдавал 200, а `HEAD` — 404: имя маршрута с суффиксом `.get`
   * регистрирует в Nitro только GET. Краулер, который сперва пробует HEAD,
   * решал, что файла нет, и содержимое ниже уже не имело значения.
   */
  const head = await fetch(`${BASE}/llms.txt`, { method: 'HEAD' })
  check(head.status === 200, `HEAD /llms.txt отвечает 200 (${head.status})`)
  const file = await (await fetch(`${BASE}/llms.txt`)).text()
  check(file.includes('## Условия'), 'есть свод условий')
  check(/Доставка:/.test(file) && /рабочих дня/.test(file), 'назван срок доставки')
  check(/Оплата:/.test(file), 'названы способы оплаты')
  check(/Возврат и обмен:/.test(file), 'названы условия возврата')
  check(/1 бонус = 1/.test(file), 'названа бонусная программа')
  check(/## Контакты/.test(file) && /\+7 702 537 94 73/.test(file), 'есть контакты')
  check(/\/brand\/lego\)/.test(file), 'страница LEGO перечислена среди брендов')
}

// ---------- 4. Магазин как сущность ----------
{
  console.log('\n4) разметка магазина')
  const html = await (await fetch(`${BASE}/brand/lego`)).text()
  const nodes = []
  for (const raw of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(raw[1])
      nodes.push(...(data['@graph'] ?? [data]))
    }
    catch {}
  }
  const org = nodes.find(n => String(n['@type']).includes('Organization'))
  check(!!org && String(org['@type']).includes('OnlineStore'), `тип организации: ${org?.['@type']}`)
  check(!!org?.telephone && !!org?.email, `телефон ${org?.telephone}, почта ${org?.email}`)
  check((org?.sameAs ?? []).length >= 3, `профилей в sameAs: ${(org?.sameAs ?? []).length}`)
  check(!!org?.address?.addressLocality, `город в адресе: ${org?.address?.addressLocality}`)

  const faq = nodes.find(n => n['@type'] === 'FAQPage')
  check((faq?.mainEntity ?? []).length >= 5, `вопросов в разметке: ${(faq?.mainEntity ?? []).length}`)

  const product = nodes.find(n => n['@type'] === 'ItemList')
  check(!!product, 'список товаров в разметке есть')
}

console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: страница готова для ИИ-поисковиков' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)
