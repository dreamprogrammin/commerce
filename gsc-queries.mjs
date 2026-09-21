/**
 * Запросы из Search Console — сколько показов и кликов приносит слово.
 *
 * ЗАЧЕМ. Решения «убрать текст» или «оставить» без цифр спроса — гадание.
 * Здесь читается боевая статистика поиска: сервис-аккаунт лежит в корне
 * репозитория (`service-account.json`, путь берётся из
 * `~/.config/claude-seo/google-api.json`), библиотек Google не нужно —
 * токен подписывается вручную через `node:crypto`.
 *
 *   node gsc-queries.mjs                     # 20 самых частых запросов за 90 дней
 *   node gsc-queries.mjs астан шымкент       # только запросы с этими словами
 *   node gsc-queries.mjs --days=28 казахстан
 *
 * Только чтение.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'

const CONFIG = `${os.homedir()}/.config/claude-seo/google-api.json`
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
const sa = JSON.parse(fs.readFileSync(config.service_account_path, 'utf8'))
/*
 * Свойство в Search Console — ДОМЕННОЕ (`sc-domain:uhti.kz`), а не адресное.
 * В `~/.config/claude-seo/google-api.json` записано `https://uhti.kz/`, и по
 * нему API отвечает «нет прав»: у сервис-аккаунта доступ именно к домену
 * (проверено запросом `/webmasters/v3/sites`). Поэтому адресный вид
 * переводится в доменный, а `--property=` позволяет задать явно.
 */
const fromArgs = process.argv.find(a => a.startsWith('--property='))?.slice(11)
const configured = config.default_property ?? 'sc-domain:uhti.kz'
const property = fromArgs ?? (configured.startsWith('sc-domain:')
  ? configured
  : `sc-domain:${new URL(configured).hostname}`)

const args = process.argv.slice(2)
const days = Number(args.find(a => a.startsWith('--days='))?.slice(7) ?? 90)
const words = args.filter(a => !a.startsWith('--')).map(w => w.toLowerCase())

const base64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Токен доступа: подписанный JWT в обмен на access_token. */
async function getToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signature = base64url(
    crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key),
  )

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  const json = await res.json()
  if (!json.access_token)
    throw new Error(`не выдан токен: ${JSON.stringify(json).slice(0, 200)}`)
  return json.access_token
}

/*
 * `--by=query` (по умолчанию) — запросы; `--by=page` — страницы;
 * `--by=query,page` — пары «запрос + страница», по ним и видно, какая
 * страница показывается по какому запросу и на каком месте.
 */
const DIMS = (process.argv.find(a => a.startsWith('--by='))?.slice(5) ?? 'query').split(',')

const iso = d => d.toISOString().slice(0, 10)
const token = await getToken()

const res = await fetch(
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
  {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: iso(new Date(Date.now() - days * 86400000)),
      endDate: iso(new Date()),
      dimensions: DIMS,
      rowLimit: 1000,
    }),
  },
)
const data = await res.json()
if (data.error)
  throw new Error(`Search Console: ${data.error.message}`)

const rows = data.rows ?? []
const key = r => r.keys.join('  ←  ')
const picked = words.length
  ? rows.filter(r => words.some(w => key(r).toLowerCase().includes(w)))
  : rows

const sum = (list, key) => list.reduce((s, r) => s + r[key], 0)

console.log(`${property} — ${days} дней, запросов всего ${rows.length}`)
console.log(`  показов ${sum(rows, 'impressions')}, кликов ${sum(rows, 'clicks')}`)
if (words.length)
  console.log(`\nс словами [${words.join(', ')}]: запросов ${picked.length}, показов ${sum(picked, 'impressions')}, кликов ${sum(picked, 'clicks')}`)

/*
 * `--zero` — только то, где показы есть, а кликов нет: именно там лежит
 * неиспользованный спрос. `--top=N` — сколько строк печатать.
 */
const onlyZero = process.argv.includes('--zero')
const top = Number(process.argv.find(a => a.startsWith('--top='))?.slice(6) ?? 20)
const list = (onlyZero ? picked.filter(r => r.clicks === 0) : picked)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, top)

if (onlyZero)
  console.log(`\nбез единого клика: строк ${picked.filter(r => r.clicks === 0).length}, показов ${sum(picked.filter(r => r.clicks === 0), 'impressions')}`)

console.log()
for (const r of list)
  console.log(`  ${String(r.impressions).padStart(5)} показов ${String(r.clicks).padStart(3)} кликов  место ${r.position.toFixed(1).padStart(5)}  ${key(r)}`)
