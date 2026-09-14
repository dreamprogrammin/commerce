/*
 * Внутренние ссылки главной и ключевых страниц ведут на живые адреса.
 *
 * Повод: 14 сентября 2026 на главной в карточке бонусной программы кнопка
 * «Правила» вела на `/bonus-program-rules` — страницы с таким адресом нет ни
 * на проде, ни в репозитории, посетитель получал 404. Ссылка висела в трёх
 * местах одного компонента.
 *
 * Проверяются ссылки в разметке, а не весь сайт: этого достаточно, чтобы
 * поймать адрес, которого не существует, и дёшево гонять на каждой сборке.
 *
 *   node check-internal-links.mjs --base=http://localhost:3008
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3008'

/** Со страниц, закрытых от гостя, ссылки не проверяем — там свой редирект. */
const SKIP = [/^\/profile/, /^\/admin/, /^\/checkout/, /^\/auth/, /^\/api\//]

const PAGES = ['/', '/brand/lego', '/catalog', '/about', '/terms', '/returns']

/*
 * Страницы, которые обязаны отвечать 200. `/forgot-password` и `/register`
 * до 14 сентября 2026 отдавали 500 — и на проде тоже: их шаблоны читали
 * `authStore.errors.…`, а такого поля в сторе нет.
 */
const MUST_RENDER = ['/forgot-password', '/register', '/reset-password', '/confirm']

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

async function hrefsOf(path) {
  const html = await (await fetch(`${BASE}${path}`)).text()
  const found = [...html.matchAll(/href="(\/[^"#?][^"]*)"/g)].map(m => m[1])
  return { html, hrefs: [...new Set(found)] }
}

const checked = new Map()

for (const page of PAGES) {
  const { hrefs } = await hrefsOf(page)
  const targets = hrefs.filter(h => !SKIP.some(rule => rule.test(h)))
  const dead = []

  for (const href of targets) {
    if (!checked.has(href)) {
      const response = await fetch(`${BASE}${href}`, { redirect: 'follow' })
      checked.set(href, response.status)
    }
    const status = checked.get(href)
    if (status >= 400)
      dead.push(`${href} → ${status}`)
  }

  check(
    dead.length === 0,
    dead.length === 0
      ? `${page}: все ${targets.length} внутренних ссылок живые`
      : `${page}: битые ссылки — ${dead.join(', ')}`,
  )
}

/*
 * Ссылки, записанные в исходниках, тоже обязаны вести на живые адреса.
 *
 * Эта часть ловит то, чего не видно на отрисованной странице: ссылку в
 * компоненте, который сейчас нигде не смонтирован. Ровно так и жил
 * `/bonus-program-rules` — он лежал в `BonusProgramCard.vue`, на страницах
 * этого компонента нет, а адреса не существует.
 *
 * Берём только литеральные пути (`to="/…"`, `href="/…"`): вычисляемые
 * проверить статикой нельзя.
 */
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs')
  const { join } = await import('node:path')

  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory())
        walk(full)
      else if (/\.(vue|ts)$/.test(entry))
        files.push(full)
    }
  }
  for (const dir of ['components', 'pages', 'layouts'])
    walk(dir)

  const found = new Map()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    /*
     * Кроме разметки смотрим и переходы из кода: `navigateTo('/login')` в
     * `reset-password` уводил человека на несуществующий адрес сразу после
     * смены пароля, и в разметке этого не видно.
     */
    const patterns = [
      /\b(?:to|href)="(\/[a-z0-9\-/#]*)"/gi,
      /navigateTo\(\s*'(\/[a-z0-9\-/#]*)'/gi,
    ]
    for (const match of [...patterns.flatMap(re => [...source.matchAll(re)])]) {
      const path = match[1]
      if (path === '/' || SKIP.some(rule => rule.test(path)))
        continue
      if (!found.has(path))
        found.set(path, file)
    }
  }

  const dead = []
  for (const [path, file] of found) {
    const bare = path.split('#')[0] || '/'
    if (!checked.has(bare)) {
      const response = await fetch(`${BASE}${bare}`, { redirect: 'follow' })
      checked.set(bare, response.status)
    }
    if (checked.get(bare) >= 400)
      dead.push(`${path} (${file}) → ${checked.get(bare)}`)
  }

  check(
    dead.length === 0,
    dead.length === 0
      ? `в исходниках ${found.size} литеральных ссылок, все живые`
      : `битые ссылки в исходниках: ${dead.join('; ')}`,
  )
}

/*
 * Кнопка «Правила» бонусной программы ведёт в раздел 7 пользовательского
 * соглашения: условия начисления опубликованы там, отдельной страницы правил
 * у магазина нет.
 */
{
  const { readFileSync } = await import('node:fs')
  const card = readFileSync('components/home/BonusProgramCard.vue', 'utf8')
  const rulesHref = card.match(/to="([^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*\s*Правила/)?.[1]
    ?? card.match(/to="(\/terms[^"]*)"/)?.[1]
    ?? ''
  check(rulesHref.startsWith('/terms#'), `кнопка «Правила» ведёт на «${rulesHref}»`)

  const anchor = rulesHref.split('#')[1]
  if (anchor) {
    const target = await (await fetch(`${BASE}/terms`)).text()
    check(target.includes(`id="${anchor}"`), `на /terms есть якорь #${anchor}`)
    check(/Бонусная программа/i.test(target), 'в этом же документе описаны условия бонусов')
  }
}

for (const path of MUST_RENDER) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'follow' })
  check(response.status === 200, `${path} отвечает ${response.status}`)
}

console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: внутренние ссылки живые' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)
