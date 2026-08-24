/**
 * Прокси, добавляющий gzip. Локальный `node .output/server/index.mjs` отдаёт
 * без сжатия, а Vercel на проде сжимает — без этого замер DCL завышает плату
 * за размер разметки в разы.
 *   node gzip-proxy.mjs <порт-прокси> <порт-источника>
 */
import http from 'node:http'
import { gzipSync } from 'node:zlib'

const [listen, upstream] = process.argv.slice(2).map(Number)

http.createServer((req, res) => {
  const p = http.request({ host: '127.0.0.1', port: upstream, path: req.url, method: req.method, headers: { ...req.headers, 'accept-encoding': 'identity' } }, (up) => {
    const chunks = []
    up.on('data', c => chunks.push(c))
    up.on('end', () => {
      const body = Buffer.concat(chunks)
      const type = up.headers['content-type'] || ''
      const compressible = /text\/|javascript|json|svg|xml/.test(type)
      const accepts = /gzip/.test(req.headers['accept-encoding'] || '')
      const headers = { ...up.headers }
      delete headers['content-length']
      delete headers['content-encoding']
      if (compressible && accepts && body.length > 1024) {
        const gz = gzipSync(body, { level: 6 })
        res.writeHead(up.statusCode, { ...headers, 'content-encoding': 'gzip', 'content-length': gz.length })
        res.end(gz)
      }
      else {
        res.writeHead(up.statusCode, { ...headers, 'content-length': body.length })
        res.end(body)
      }
    })
  })
  p.on('error', () => { res.writeHead(502); res.end() })
  req.pipe(p)
}).listen(listen, () => console.log(`gzip-прокси :${listen} → :${upstream}`))
