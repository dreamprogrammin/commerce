/**
 * Search Console: карты сайта и разбор конкретных адресов.
 *
 * Отчёт «Индексирование страниц» в API не отдаётся вовсе — Google его не
 * публикует. Зато доступны две вещи, которых хватает, чтобы понять, что
 * именно покраснело:
 *   • `sitemaps` — когда карта прочитана, сколько в ней ошибок и
 *     предупреждений, сколько адресов Google из неё взял;
 *   • `urlInspection` — вердикт по конкретному адресу: в индексе ли он,
 *     что сказал robots, какой канонический адрес выбрал Google, когда
 *     обходил, что с расширенными результатами и мобильным видом.
 *
 *   node gsc-status.mjs                      # карты сайта
 *   node gsc-status.mjs /brand/lego /catalog # разбор адресов
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

/** Свойство доменное — см. пояснение в `gsc-queries.mjs`. */
const configured = config.default_property ?? 'sc-domain:uhti.kz'
const property = configured.startsWith('sc-domain:')
  ? configured
  : `sc-domain:${new URL(configured).hostname}`
const site = `https://${property.replace('sc-domain:', '')}`

const base64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

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

const token = await getToken()
const auth = { Authorization: `Bearer ${token}` }
const paths = process.argv.slice(2).filter(a => !a.startsWith('--'))

// ── Карты сайта ───────────────────────────────────────────────────────────
if (paths.length === 0) {
  const data = await (await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`,
    { headers: auth },
  )).json()
  if (data.error)
    throw new Error(`Search Console: ${data.error.message}`)

  const list = data.sitemap ?? []
  console.log(`${property} — карт сайта: ${list.length}\n`)
  for (const s of list) {
    console.log(`  ${s.path}`)
    console.log(`     прочитана: ${s.lastDownloaded ?? 'ни разу'} | отправлена: ${s.lastSubmitted ?? '—'}`)
    console.log(`     ошибок: ${s.errors ?? 0} | предупреждений: ${s.warnings ?? 0} | помечена устаревшей: ${s.isPending ? 'да' : 'нет'}`)
    for (const c of s.contents ?? [])
      console.log(`     тип ${c.type}: отправлено ${c.submitted}, проиндексировано ${c.indexed ?? '—'}`)
    console.log()
  }
  process.exit(0)
}

// ── Разбор адресов ────────────────────────────────────────────────────────
for (const p of paths) {
  const url = p.startsWith('http') ? p : `${site}${p}`
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  })
  const data = await res.json()
  if (data.error) {
    console.log(`${url}\n  ошибка запроса: ${data.error.message}\n`)
    continue
  }

  const r = data.inspectionResult ?? {}
  const i = r.indexStatusResult ?? {}
  console.log(url)
  console.log(`  вердикт: ${i.verdict ?? '—'} | состояние: ${i.coverageState ?? '—'}`)
  console.log(`  robots: ${i.robotsTxtState ?? '—'} | индексирование: ${i.indexingState ?? '—'}`)
  console.log(`  канонический у Google: ${i.googleCanonical ?? '—'}`)
  console.log(`  канонический у нас:    ${i.userCanonical ?? '—'}`)
  console.log(`  обход: ${i.lastCrawlTime ?? 'не обходился'} | через: ${i.crawledAs ?? '—'}`)
  if (r.mobileUsabilityResult)
    console.log(`  мобильный вид: ${r.mobileUsabilityResult.verdict}${(r.mobileUsabilityResult.issues ?? []).map(x => `\n     • ${x.issueType}: ${x.message}`).join('')}`)
  for (const rich of r.richResultsResult?.detectedItems ?? []) {
    const bad = (rich.items ?? []).flatMap(it => it.issues ?? []).filter(x => x.severity === 'ERROR')
    console.log(`  расширенные результаты «${rich.richResultType}»: ${r.richResultsResult.verdict}${bad.length ? ` — ошибок ${bad.length}: ${bad.map(b => b.issueMessage).join('; ')}` : ''}`)
  }
  console.log()
}
