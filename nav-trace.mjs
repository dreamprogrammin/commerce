// Разбор занятости потока при возврате на главную по видам работы.
import { chromium } from 'playwright'
import fs from 'node:fs'
const BASE = 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)

const events = []
cdp.on('Tracing.dataCollected', d => events.push(...d.value))
await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(4000)
const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.end'); await done

const RU = {
  ParseHTML: 'разбор HTML', EvaluateScript: 'выполнение скрипта', FunctionCall: 'вызовы функций',
  UpdateLayoutTree: 'пересчёт стилей', Layout: 'раскладка', Paint: 'отрисовка',
  PaintImage: 'отрисовка картинок', Decode: 'декодирование картинок', ImageDecodeTask: 'декодирование картинок',
  DecodeImage: 'декодирование картинок', ResizeImage: 'масштабирование картинок',
  CompositeLayers: 'композиция слоёв', UpdateLayer: 'слои', UpdateLayerTree: 'слои',
  TimerFire: 'таймеры', GCEvent: 'сборка мусора', MajorGC: 'сборка мусора', MinorGC: 'сборка мусора',
  'V8.Execute': 'выполнение JS', CommitLoad: 'загрузка', HitTest: 'попадание курсора',
}
const agg = new Map()
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue
  const name = RU[e.name] || e.name
  agg.set(name, (agg.get(name) || 0) + e.dur / 1000)
}
const rows = [...agg.entries()].map(([n, ms]) => ({ n, ms: Math.round(ms) })).filter(r => r.ms >= 5).sort((a, b) => b.ms - a.ms)
const sum = rows.reduce((a, r) => a + r.ms, 0)
console.log(`суммарно учтено ${sum} мс\n`)
for (const r of rows.slice(0, 18)) console.log(String(r.ms).padStart(6), 'мс  ', r.n)
fs.writeFileSync('/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad/trace.json', JSON.stringify(rows, null, 2))
await browser.close()
