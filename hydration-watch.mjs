/*
 * Где именно расходится гидратация — в ОБЫЧНОЙ сборке, без подробностей Vue.
 *
 * В собранной версии Vue пишет только «Hydration completed but contains
 * mismatches.» и не говорит где; проверку атрибутов (включая id от useId) он
 * там не делает вовсе — только текст, лишние узлы и замену узла. Инструмент
 * записывает мутации DOM с первых миллисекунд и момент этой ошибки, и если
 * она случилась, печатает мутации рядом по времени: там Vue и чинил DOM.
 *
 * История: 22 сентября 2026 на /brand/zuru ошибка всплывала в 2 загрузках
 * из 10 (стенд и бой), а при разборе — ни в 20 загрузках стенда, ни в 12
 * загрузках боя. Подробная сборка (__VUE_PROD_HYDRATION_MISMATCH_DETAILS__)
 * показала только другое, постоянное расхождение: id элементов reka-ui
 * (кнопка поповера и два раскрывающихся блока) на сервере «v-0-9-…», в
 * браузере «v-0-0-…» — его обычная сборка не проверяет.
 *
 *   node hydration-watch.mjs <адрес> [сколько загрузок]
 *   node hydration-watch.mjs http://localhost:3127/brand/zuru 20
 *
 * Только чтение.
 */
import process from 'node:process'
import { chromium } from 'playwright'

const URL_ = process.argv[2] || 'http://localhost:3127/brand/zuru'
const N = Number(process.argv[3] || 20)
const browser = await chromium.launch()
let hits = 0
for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    window.__muts = []
    window.__errAt = null
    const origErr = console.error
    console.error = function (...a) {
      if (String(a[0]).includes('Hydration completed but contains mismatches') && window.__errAt === null)
        window.__errAt = performance.now()
      return origErr.apply(this, a)
    }
    const desc = (n) => {
      if (!n)
        return '?'
      if (n.nodeType === 3)
        return `#text«${(n.data || '').trim().slice(0, 40)}»`
      if (n.nodeType === 8)
        return `<!--${(n.data || '').slice(0, 10)}-->`
      const parts = []
      for (let e = n, k = 0; e && e.nodeType === 1 && k < 4; e = e.parentElement, k++)
        parts.unshift(e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (e.classList?.length ? `.${[...e.classList].slice(0, 2).join('.')}` : ''))
      return parts.join('>')
    }
    new MutationObserver((list) => {
      const t = performance.now()
      for (const m of list) {
        if (window.__muts.length > 4000)
          return
        window.__muts.push({ t, type: m.type, target: desc(m.target), attr: m.attributeName, added: [...m.addedNodes].slice(0, 2).map(desc), removed: [...m.removedNodes].slice(0, 2).map(desc) })
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, characterDataOldValue: true })
  })
  const page = await ctx.newPage()
  await page.goto(URL_, { waitUntil: 'load', timeout: 180000 }).catch(() => {})
  await page.waitForTimeout(4000)
  const r = await page.evaluate(() => ({ errAt: window.__errAt, muts: window.__muts }))
  if (r.errAt !== null) {
    hits++
    const near = r.muts.filter(m => Math.abs(m.t - r.errAt) < 30 && m.type !== 'attributes')
    console.log(`\nзагрузка ${i + 1}: РАСХОЖДЕНИЕ в ${r.errAt.toFixed(0)} мс; мутаций рядом (±30 мс, без атрибутов): ${near.length}`)
    for (const m of near.slice(0, 25)) console.log(`  ${m.t.toFixed(0)} ${m.type} ${m.target}${m.added.length ? ` +[${m.added.join(', ')}]` : ''}${m.removed.length ? ` -[${m.removed.join(', ')}]` : ''}`)
  }
  await ctx.close()
}
await browser.close()
console.log(`\nрасхождений: ${hits} из ${N}`)
