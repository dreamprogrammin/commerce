/**
 * Наблюдатель за Search Console: сообщает только то, что ИЗМЕНИЛОСЬ.
 *
 * ЗАЧЕМ. Владелец видит в Search Console замечания и не может понять, новые
 * они или висят с весны. Так и было с «Отсутствует поле validFrom»: разметку
 * починили 21 сентября, но на страницах, которые Google с тех пор не
 * переобходил, замечание осталось — и выглядело как свежая поломка.
 *
 * ЧТО СМОТРИТ. Карту сайта (ошибки, предупреждения, когда прочитана) и
 * разбор адресов: в индексе ли, что с robots и каноническим, какие замечания
 * у расширенных результатов. Список адресов НЕ зашит: берутся самые
 * показываемые страницы за 28 дней плюс несколько обязательных.
 *
 * ЧТО ПЕЧАТАЕТ. Разницу с прошлым запуском: что появилось, что ушло. Если
 * ничего не менялось — одна строка «без изменений».
 *
 * КОДЫ ВОЗВРАТА: 0 — без изменений, 1 — появилось новое, 2 — запуск не
 * удался (нет ключа, сеть, отказ API).
 *
 *   node gsc-watch.mjs              # сравнить с прошлым разом
 *   node gsc-watch.mjs --full       # ещё и показать текущее состояние целиком
 *   node gsc-watch.mjs --urls=12    # сколько страниц разбирать (по умолчанию 10)
 *
 * Только чтение. Слепок лежит в `.local-backup/gsc-watch.json` (вне git).
 */
import crypto from 'node:crypto'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

/*
 * Коды возврата разделены нарочно: 0 — без изменений, 1 — ПОЯВИЛОСЬ новое,
 * 2 — запуск не удался (нет ключа, сеть, отказ API). Планировщик тревожит
 * владельца только на единице: сетевой сбой — не находка, и будить им
 * человека незачем. Разбирались с этим после того, как таймаут до Google
 * попал в журнал как «новое замечание».
 */
const die = (e) => {
  console.error(`запуск не удался: ${e?.message ?? e}`)
  process.exit(2)
}
process.on('uncaughtException', die)
process.on('unhandledRejection', die)

/*
 * ПУТИ ПЕРЕОПРЕДЕЛЯЮТСЯ ПЕРЕМЕННЫМИ — и это не украшательство.
 * macOS запрещает заданиям планировщика ЧИТАТЬ файлы в ~/Desktop: проверено
 * запуском, `head` на файл репозитория отвечает «Operation not permitted»,
 * хотя `ls` проходит. Репозиторий лежит как раз на Рабочем столе, поэтому
 * установленная копия наблюдателя живёт вне его (см. `gsc-watch-install.sh`)
 * и берёт ключ и слепок из своего каталога.
 */
const CONFIG = process.env.GSC_CONFIG || `${os.homedir()}/.config/claude-seo/google-api.json`
const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
const SA_PATH = process.env.GSC_SA_PATH || config.service_account_path
const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))

const configured = config.default_property ?? 'sc-domain:uhti.kz'
const property = configured.startsWith('sc-domain:')
  ? configured
  : `sc-domain:${new URL(configured).hostname}`
const site = `https://${property.replace('sc-domain:', '')}`

const STATE = path.join(process.env.GSC_STATE_DIR || path.join(process.cwd(), '.local-backup'), 'gsc-watch.json')
const FULL = process.argv.includes('--full')
const HOW_MANY = Number(process.argv.find(a => a.startsWith('--urls='))?.slice(7) ?? 10)

/** Всегда в списке, даже если показов нет: по ним и видно общее здоровье. */
const ALWAYS = ['/', '/catalog', '/brand/lego']

/*
 * Сеть до Google иногда отваливается по таймауту — один такой сбой уже попал
 * в журнал. Повторяем дважды, а если не вышло, выходим кодом 2: это «запуск
 * не удался», а не «появилось новое замечание», и тревожить владельца им
 * незачем.
 */
async function fetchRetry(url, init, tries = 3) {
  let last
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetch(url, init)
    }
    catch (e) {
      last = e
      if (i < tries)
        await new Promise(r => setTimeout(r, 2000 * i))
    }
  }
  throw new Error(`сеть недоступна после ${tries} попыток: ${last?.message ?? last}`)
}

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
  const res = await fetchRetry('https://oauth2.googleapis.com/token', {
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
const iso = d => d.toISOString().slice(0, 10)

// ── Какие адреса смотреть: самые показываемые за 28 дней ──────────────────
async function topPages() {
  const res = await fetchRetry(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: iso(new Date(Date.now() - 28 * 86400000)),
        endDate: iso(new Date()),
        dimensions: ['page'],
        rowLimit: 50,
      }),
    },
  )
  const data = await res.json()
  if (data.error)
    throw new Error(`Search Console: ${data.error.message}`)
  return (data.rows ?? []).map(r => r.keys[0].replace(site, '') || '/')
}

const pages = [...new Set([...ALWAYS, ...(await topPages())])].slice(0, HOW_MANY)

// ── Разбор ────────────────────────────────────────────────────────────────
const now = { sitemaps: {}, pages: {} }

const sm = await (await fetchRetry(
  `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/sitemaps`,
  { headers: auth },
)).json()
for (const s of sm.sitemap ?? []) {
  now.sitemaps[s.path] = {
    ошибок: Number(s.errors ?? 0),
    предупреждений: Number(s.warnings ?? 0),
    прочитана: (s.lastDownloaded ?? '').slice(0, 10),
  }
}

for (const p of pages) {
  const url = `${site}${p}`
  const res = await fetchRetry('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: property }),
  })
  const data = await res.json()
  if (data.error) {
    now.pages[p] = { ошибка_запроса: data.error.message }
    continue
  }
  const r = data.inspectionResult ?? {}
  const i = r.indexStatusResult ?? {}
  /*
   * Замечания сводим в набор строк «тип: текст» БЕЗ имени товара: на
   * странице списка их десятки, и меняющийся состав товаров давал бы
   * «изменения» каждый день. Нам важно, какие замечания есть, а не у скольких
   * позиций.
   */
  const issues = new Set()
  for (const rich of r.richResultsResult?.detectedItems ?? []) {
    for (const it of rich.items ?? []) {
      for (const x of it.issues ?? [])
        issues.add(`${rich.richResultType}: ${x.severity === 'ERROR' ? '❌' : '⚠️'} ${x.issueMessage}`)
    }
  }
  now.pages[p] = {
    состояние: i.coverageState ?? '—',
    вердикт: i.verdict ?? '—',
    обход: (i.lastCrawlTime ?? '').slice(0, 10),
    замечания: [...issues].sort(),
  }
}

// ── Сравнение с прошлым разом ─────────────────────────────────────────────
const prev = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null
const changes = []

for (const [path_, s] of Object.entries(now.sitemaps)) {
  const p0 = prev?.sitemaps?.[path_]
  if (!p0) { changes.push(`карта сайта ${path_}: впервые в наблюдении`); continue }
  if (s.ошибок !== p0.ошибок)
    changes.push(`карта сайта ${path_}: ошибок ${p0.ошибок} → ${s.ошибок}`)
  if (s.предупреждений !== p0.предупреждений)
    changes.push(`карта сайта ${path_}: предупреждений ${p0.предупреждений} → ${s.предупреждений}`)
}

for (const [p, cur] of Object.entries(now.pages)) {
  const was = prev?.pages?.[p]
  if (!was) { changes.push(`${p}: впервые в наблюдении — ${cur.состояние}`); continue }
  if (cur.состояние !== was.состояние)
    changes.push(`${p}: состояние «${was.состояние}» → «${cur.состояние}»`)
  const add = (cur.замечания ?? []).filter(x => !(was.замечания ?? []).includes(x))
  const gone = (was.замечания ?? []).filter(x => !(cur.замечания ?? []).includes(x))
  for (const x of add) changes.push(`${p}: ПОЯВИЛОСЬ ${x}`)
  for (const x of gone) changes.push(`${p}: ушло ${x}`)
}

console.log(`${property} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}, страниц под наблюдением: ${pages.length}`)

if (!prev)
  console.log('\nпервый запуск: слепок сохранён, сравнивать пока не с чем')
else if (changes.length === 0)
  console.log('\nбез изменений')
else
  console.log(`\nизменений: ${changes.length}\n${changes.map(c => `  • ${c}`).join('\n')}`)

if (FULL) {
  console.log('\n— состояние целиком —')
  for (const [p, cur] of Object.entries(now.pages)) {
    console.log(`  ${p}\n     ${cur.состояние} | обход ${cur.обход || 'не было'}`)
    for (const x of cur.замечания ?? []) console.log(`     ${x}`)
  }
}

fs.mkdirSync(path.dirname(STATE), { recursive: true })
fs.writeFileSync(STATE, JSON.stringify(now, null, 2))

const appeared = changes.filter(c => c.includes('ПОЯВИЛОСЬ') || c.includes('ошибок'))
process.exit(appeared.length > 0 ? 1 : 0)
