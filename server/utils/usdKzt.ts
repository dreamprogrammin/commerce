import type { UsdKzt } from '~/utils/aiCost'
import { aiStubBase } from './aiProviders'

/**
 * Курс доллара для расхода ИИ в тенге (24 ноября 2026) — официальный курс
 * Нацбанка РК из его открытой ленты. Держится в памяти экземпляра до смены
 * дня по Алматы. Лента не ответила за 4 с — прежний курс экземпляра или
 * зашитый в код, с пометкой `stale`: дата курса видна в карточке.
 *
 * На стенде (AI_STUB_URL) лента берётся у той же локальной заглушки, что и
 * модель, — наружу стенд не ходит.
 */

const FEED = 'https://nationalbank.kz/rss/rates_all.xml'
/** Курс Нацбанка на 24.11.2026 — когда ленты нет и прежнего курса тоже */
const BUILT_IN: UsdKzt = { kzt: 455.12, date: '24.11.2026', stale: true }
const TIMEOUT_MS = 4000

let held: { day: string, rate: UsdKzt } | null = null

/** USD из ленты rates_all.xml: `<item><title>USD</title><pubDate>ДД.ММ.ГГГГ</pubDate><description>455.12</description><quant>1</quant>…` */
export function parseNbkUsd(xml: string): UsdKzt | null {
  const item = xml.split(/<item>/i).slice(1).map(part => part.split(/<\/item>/i)[0] ?? '').find(part => /<title>\s*USD\s*<\/title>/i.test(part))
  if (!item)
    return null
  const date = /<pubDate>\s*(\d{2}\.\d{2}\.\d{4})\s*<\/pubDate>/i.exec(item)?.[1]
  const value = Number(/<description>\s*(\d+(?:\.\d+)?)\s*<\/description>/i.exec(item)?.[1])
  const quant = Number(/<quant>\s*(\d+)\s*<\/quant>/i.exec(item)?.[1] ?? 1)
  if (!date || !Number.isFinite(value) || !quant)
    return null
  const kzt = value / quant
  // Курс вне разумного — значит, лента сменила формат, а не тенге упал в десять раз
  return kzt > 100 && kzt < 5000 ? { kzt, date } : null
}

const almatyDay = (now: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(now)

/** Курс на сегодня; не бросает — на худой конец курс из кода */
export async function usdKztRate(now = new Date()): Promise<UsdKzt> {
  const day = almatyDay(now)
  if (held?.day === day)
    return held.rate
  try {
    const stub = aiStubBase()
    const res = await fetch(stub ? `${stub}/nbk/rates_all.xml` : FEED, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    const rate = res.ok ? parseNbkUsd(await res.text()) : null
    if (rate) {
      held = { day, rate }
      return rate
    }
    console.error(`[usd-kzt] лента Нацбанка: ${res.ok ? 'нет курса USD' : `ответ ${res.status}`}`)
  }
  catch (e) {
    console.error('[usd-kzt] лента Нацбанка не ответила:', (e as Error).message)
  }
  return held ? { ...held.rate, stale: true } : BUILT_IN
}
