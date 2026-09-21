/**
 * Вес файла сборки по npm-пакетам: минифицированный и в gzip.
 *
 * Считается по карте исходников: каждый сегмент минифицированного кода
 * относится к пакету, из которого он пришёл. Нужна сборка с
 * `sourcemap: { client: 'hidden' }` (см. js-cpu-by-package.mjs).
 *
 * 21 сентября 2026 на точке входа: Supabase целиком 190 КБ из 723 (26 %),
 * в gzip ≈ 54 КБ — около 0,27 с скачивания на сети 1.6 Мбит/с; из них
 * realtime с phoenix ≈ 16 КБ, то есть ≈ 0,08 с.
 *
 *   node js-bytes-by-package.mjs .output/public/_nuxt/<файл>.js
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { eachMapping, TraceMap } from '@jridgewell/trace-mapping'
const file = process.argv[2]
const code = fs.readFileSync(file, 'utf8')
const tm = new TraceMap(fs.readFileSync(`${file}.map`, 'utf8'))
const lines = code.split('\n')
const lineStart = []; let off = 0
for (const l of lines) { lineStart.push(off); off += l.length + 1 }
const segs = []
eachMapping(tm, m => { segs.push({ at: lineStart[m.generatedLine - 1] + m.generatedColumn, src: m.source }) })
segs.sort((a, b) => a.at - b.at)
const pkgOf = src => {
  if (!src) return '(без карты)'
  const m = src.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)
  return m ? m[1] : 'приложение и Nuxt-обвязка'
}
const pieces = new Map()
for (let i = 0; i < segs.length; i++) {
  const end = i + 1 < segs.length ? segs[i + 1].at : code.length
  const k = pkgOf(segs[i].src)
  if (!pieces.has(k)) pieces.set(k, [])
  pieces.get(k).push(code.slice(segs[i].at, end))
}
const total = code.length, gzTotal = zlib.gzipSync(code).length
console.log(`кусок: ${(total / 1024).toFixed(0)} КБ, gzip ${(gzTotal / 1024).toFixed(0)} КБ\n`)
const rows = [...pieces].map(([k, arr]) => { const s = arr.join(''); return [k, s.length, zlib.gzipSync(s).length] })
  .sort((a, b) => b[1] - a[1])
for (const [k, n, g] of rows.slice(0, 14))
  console.log(`  ${(n / 1024).toFixed(0).padStart(4)} КБ  gzip ≈ ${(g / 1024).toFixed(0).padStart(3)} КБ  ${k}`)
const supa = rows.filter(([k]) => k.startsWith('@supabase/'))
const sn = supa.reduce((a, r) => a + r[1], 0), sg = supa.reduce((a, r) => a + r[2], 0)
console.log(`\n  Supabase целиком: ${(sn / 1024).toFixed(0)} КБ = ${(100 * sn / total).toFixed(0)} % куска, gzip ≈ ${(sg / 1024).toFixed(0)} КБ`)
console.log(`  на эмулируемой сети 1.6 Мбит/с это ≈ ${(sg * 8 / (1.6 * 1024 * 1024)).toFixed(2)} с скачивания`)
