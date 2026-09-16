/*
 * Чем на самом деле держится LCP: элемент, время и цепочка блокирующего CSS.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ИНСТРУМЕНТ, КОГДА ЕСТЬ PAGESPEED. 16 сентября 2026 PSI по
 * бою показывал LCP 7,3–8,7 с по медиане трёх прогонов, а живой браузер с теми
 * же тормозами — 2,8–3,2 с. Причина не в разнице стендов: Lighthouse не
 * замедляет сеть по-настоящему, а МОДЕЛИРУЕТ её (Lantern) поверх реальных
 * времён, и на длинной цепочке запросов модель сильно пессимистична. Балл PSI
 * при этом остаётся правильным ориентиром «стало лучше или хуже», а вот
 * абсолютную секунду LCP по нему называть нельзя — на этом уже строились
 * неверные выводы.
 *
 * Здесь всё честно: реальное замедление процессора вчетверо и «медленный 4G»
 * через CDP, те же цифры, что увидит покупатель с таким телефоном и сетью.
 *
 * Запуск (Playwright лежит в node_modules, скрипт обязан быть в корне репозитория):
 *   LD_LIBRARY_PATH=/home/malik/pw-libs/usr/lib/x86_64-linux-gnu \
 *     node perf-lcp.mjs https://uhti.kz / /brand/lego /catalog/girls
 *
 * Что показывает:
 *   FCP и DCL — когда страница вообще что-то нарисовала;
 *   LCP — время, тег, класс и ССЫЛКА на картинку, если это картинка;
 *   CSS — когда каждый блокирующий файл начал и закончил грузиться.
 *
 * Как читать. Если LCP идёт сразу за FCP (у нас так: 2832 против 2496 на
 * главной), то LCP-картинка не виновата — виновато то, что задержало первую
 * отрисовку. У нас это `entry.css`: 238 КБ сырьём, 37 КБ по проводу, под
 * эмуляцией грузится 598→2240 мс, и FCP ждёт именно его.
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'https://uhti.kz'
const paths = process.argv.slice(3)

if (!paths.length) {
  console.log('Укажите адреса: node perf-lcp.mjs https://uhti.kz / /brand/lego')
  process.exit(1)
}

const browser = await chromium.launch()

for (const path of paths) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
  })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  // Те же условия, что объявляет Lighthouse для мобильного прогона.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.addInitScript(() => {
    window.__lcp = null
    window.__fcp = null
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lcp = {
          time: Math.round(entry.startTime),
          url: entry.url || null,
          tag: entry.element?.tagName ?? null,
          cls: entry.element?.className?.toString?.().slice(0, 80) ?? null,
          text: (entry.element?.textContent ?? '').trim().slice(0, 60),
        }
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint')
          window.__fcp = Math.round(entry.startTime)
      }
    }).observe({ type: 'paint', buffered: true })
  })

  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(6000)

  const out = await page.evaluate(() => ({
    fcp: window.__fcp,
    lcp: window.__lcp,
    dcl: Math.round(performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0),
    css: performance.getEntriesByType('resource')
      .filter(r => r.name.endsWith('.css'))
      .map(r => ({
        file: r.name.split('/').pop().slice(0, 32),
        start: Math.round(r.startTime),
        end: Math.round(r.responseEnd),
        kb: Math.round((r.encodedBodySize || 0) / 1024),
      }))
      .sort((a, b) => a.start - b.start),
  }))

  console.log(`\n${path}`)
  console.log(`  FCP ${out.fcp} мс | DCL ${out.dcl} мс`)
  console.log(`  LCP ${out.lcp?.time} мс — <${out.lcp?.tag}> ${out.lcp?.cls ?? ''}${out.lcp?.text ? ` «${out.lcp.text}»` : ''}`)
  if (out.lcp?.url)
    console.log(`       ${out.lcp.url.slice(-72)}`)
  console.log('  блокирующий CSS:')
  for (const c of out.css.filter(c => c.start < (out.fcp ?? 0)))
    console.log(`       ${c.file.padEnd(34)} ${String(c.start).padStart(5)}→${String(c.end).padStart(5)} мс, ${c.kb} КБ`)

  await ctx.close()
}

await browser.close()
