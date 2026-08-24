/**
 * HTTP/2 + TLS + gzip + кеш документа перед локальной прод-сборкой.
 *
 * Зачем не хватает http-прокси: локальный `node .output/server/index.mjs`
 * говорит по HTTP/1.1, где браузер держит 6 соединений на хост и подсказки
 * приоритета почти не работают. Vercel отдаёт по HTTP/2 — одно соединение,
 * мультиплексирование, приоритеты. На h1-стенде 24 августа `fetchpriority`
 * не показал вообще ничего, и это был артефакт протокола, а не вывод.
 *
 * Кеш эмулирует попадание в ISR: у главной в routeRules стоит `isr`, и
 * посетитель получает готовый HTML, а локально Nitro его не держит.
 *
 *   node h2-proxy.mjs <порт> <порт-источника> <cert.pem> <key.pem>
 * Браузер запускать с ignoreHTTPSErrors — сертификат самоподписанный.
 */
import http2 from 'node:http2'
import http from 'node:http'
import fs from 'node:fs'
import { gzipSync } from 'node:zlib'

const [listen, upstream, certPath, keyPath] = process.argv.slice(2)
const cache = new Map()

const server = http2.createSecureServer({
  cert: fs.readFileSync(certPath),
  key: fs.readFileSync(keyPath),
  allowHTTP1: true,
})

function reply(stream, headers, status, upHeaders, body) {
  const h = {}
  for (const [k, v] of Object.entries(upHeaders)) {
    const key = k.toLowerCase()
    // Заголовки уровня соединения в HTTP/2 запрещены.
    if (['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'content-length', 'content-encoding'].includes(key)) continue
    h[key] = v
  }
  const type = String(h['content-type'] || '')
  const compressible = /text\/|javascript|json|svg|xml/.test(type)
  const accepts = /gzip/.test(String(headers['accept-encoding'] || ''))
  let payload = body
  if (compressible && accepts && body.length > 1024) {
    payload = gzipSync(body, { level: 6 })
    h['content-encoding'] = 'gzip'
  }
  h[':status'] = status
  h['content-length'] = payload.length
  stream.respond(h)
  stream.end(payload)
}

server.on('stream', (stream, headers) => {
  const path = headers[':path']
  const method = headers[':method'] || 'GET'
  const hit = method === 'GET' && cache.get(path)
  if (hit) { reply(stream, headers, hit.status, { ...hit.headers, 'x-local-cache': 'HIT' }, hit.body); return }

  const req = http.request({ host: '127.0.0.1', port: Number(upstream), path, method, headers: { host: 'localhost', 'accept-encoding': 'identity' } }, (up) => {
    const chunks = []
    up.on('data', c => chunks.push(c))
    up.on('end', () => {
      const body = Buffer.concat(chunks)
      if (method === 'GET' && up.statusCode === 200) cache.set(path, { status: up.statusCode, headers: up.headers, body })
      reply(stream, headers, up.statusCode, { ...up.headers, 'x-local-cache': 'MISS' }, body)
    })
  })
  req.on('error', () => { try { stream.respond({ ':status': 502 }); stream.end() } catch {} })
  req.end()
})

server.listen(Number(listen), () => console.log(`h2-прокси :${listen} → :${upstream}`))
