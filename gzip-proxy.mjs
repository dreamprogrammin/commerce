/**
 * Прокси перед локальной прод-сборкой, воспроизводящий две вещи, которых у
 * `node .output/server/index.mjs` нет, а на Vercel есть.
 *
 * 1. **gzip.** Локальный сервер не сжимает — без прокси замер завышает плату
 *    за размер разметки в разы.
 * 2. **Кеш документа (ключ `--cache`).** У главной в routeRules стоит `isr`,
 *    и на Vercel посетитель получает готовый HTML из кеша. Локально Nitro его
 *    не держит: каждый запрос заново рендерит страницу со всеми обращениями к
 *    базе. Замеренный 24 августа перекос — TTFB 360 мс против 1600 мс — целиком
 *    от этого, и он маскировал настоящую разницу между вариантами.
 *
 *   node gzip-proxy.mjs <порт-прокси> <порт-источника> [--cache]
 */
import http from 'node:http'
import { gzipSync } from 'node:zlib'

const [listen, upstream] = process.argv.slice(2, 4).map(Number)
const useCache = process.argv.includes('--cache')
const cache = new Map()

function send(res, req, status, headers, body) {
  const h = { ...headers }
  delete h['content-length']
  delete h['content-encoding']
  const compressible = /text\/|javascript|json|svg|xml/.test(h['content-type'] || '')
  if (compressible && /gzip/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    const gz = gzipSync(body, { level: 6 })
    res.writeHead(status, { ...h, 'content-encoding': 'gzip', 'content-length': gz.length })
    res.end(gz)
  }
  else {
    res.writeHead(status, { ...h, 'content-length': body.length })
    res.end(body)
  }
}

http.createServer((req, res) => {
  if (useCache && req.method === 'GET') {
    const hit = cache.get(req.url)
    if (hit) {
      send(res, req, hit.status, { ...hit.headers, 'x-local-cache': 'HIT' }, hit.body)
      return
    }
  }
  const p = http.request({ host: '127.0.0.1', port: upstream, path: req.url, method: req.method, headers: { ...req.headers, 'accept-encoding': 'identity' } }, (up) => {
    const chunks = []
    up.on('data', c => chunks.push(c))
    up.on('end', () => {
      const body = Buffer.concat(chunks)
      if (useCache && req.method === 'GET' && up.statusCode === 200)
        cache.set(req.url, { status: up.statusCode, headers: up.headers, body })
      send(res, req, up.statusCode, { ...up.headers, 'x-local-cache': 'MISS' }, body)
    })
  })
  p.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(p)
}).listen(listen, () => console.log(`gzip-прокси :${listen} → :${upstream}`))
