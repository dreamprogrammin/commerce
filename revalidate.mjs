/**
 * Ручной сброс кеша страниц ISR на Vercel (9 октября 2026).
 *
 * Зачем. Кеш страниц суточный (ради лимита трафика Supabase). Правки из
 * админки сбрасывают его сами, а вот SQL, который владелец запускает в
 * редакторе Supabase, — нет: после такого SQL страницы надо сбросить руками.
 *
 *   node revalidate.mjs /brand/mermaze /catalog/girls/kukly
 *   node revalidate.mjs --all                       # все адреса из карты сайта
 *   node revalidate.mjs --base=https://dev.uhti.kz /brand/lego
 *
 * Каждый адрес сбрасывается вместе со своим `_payload.json`. Токен — из
 * переменной ISR_BYPASS_TOKEN или из ~/.config/uhti/isr-bypass-token (тот же,
 * что на Vercel). Каждый сброс — одна пересборка страницы, то есть запросы к
 * базе: `--all` по ~300 адресам стоит порядка 50 МБ трафика Supabase.
 */
import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'

const args = process.argv.slice(2)
const base = (args.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz').replace(/\/$/, '')
const token = process.env.ISR_BYPASS_TOKEN || (() => {
  try {
    return fs.readFileSync(`${os.homedir()}/.config/uhti/isr-bypass-token`, 'utf8').trim()
  }
  catch {
    return ''
  }
})()
if (!token) {
  console.error('Нет токена: ISR_BYPASS_TOKEN или ~/.config/uhti/isr-bypass-token')
  process.exit(2)
}

let pages = args.filter(a => a.startsWith('/'))
if (args.includes('--all')) {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text()
  pages = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
}
if (!pages.length) {
  console.error('Укажите адреса (/brand/lego …) или --all')
  process.exit(2)
}

const paths = [...new Set(pages)].flatMap(p => [p, p === '/' ? '/_payload.json' : `${p}/_payload.json`])
const queue = [...paths]
let ok = 0
const failed = []
async function worker() {
  while (queue.length) {
    const path = queue.shift()
    try {
      const r = await fetch(base + path, { method: 'HEAD', headers: { 'x-prerender-revalidate': token }, signal: AbortSignal.timeout(20_000) })
      if (r.status < 500)
        ok++
      else failed.push(`${r.status} ${path}`)
    }
    catch (e) {
      failed.push(`ERR ${path}: ${e.message}`)
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
console.log(`${base}: сброшено ${ok} из ${paths.length}`)
for (const f of failed)
  console.log(`  ${f}`)
process.exit(failed.length ? 1 : 0)
