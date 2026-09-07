/**
 * Кнопка «Следить за заказом в Telegram» на странице оформленного заказа.
 * Смотрим глазами гостя: он не авторизован и своего заказа в базе прочитать
 * не может.
 *   node check-tracking-button.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const BASE = process.env.BASE || 'http://localhost:3311'
const MARK = 'button-test@uhti.kz'

const service = createClient(SUPA, SERVICE)
let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

await service.from('guest_checkouts').delete().eq('guest_email', MARK)
const { data: order } = await service.from('guest_checkouts').insert({
  guest_email: MARK, guest_phone: '+77015554433', guest_name: 'Гульмира',
  total_amount: 12000, final_amount: 12000, delivery_method: 'courier', status: 'new',
}).select('id, tracking_code, order_number').single()

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 120)))

await page.goto(`${BASE}/order/success/${order.id}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)

const shot = await page.evaluate(() => {
  const link = [...document.querySelectorAll('a')].find(a => /track-order/.test(a.getAttribute('href') || ''))
  const section = link?.closest('section')
  return {
    кнопкаЕсть: !!link,
    href: link?.getAttribute('href') || null,
    заголовок: section?.querySelector('span.font-bold')?.textContent?.trim() || null,
    обещаниеSms: document.body.innerText.includes('на указанный номер телефона'),
    номерНаСтранице: document.body.innerText.match(/Номер вашего заказа\s*\n?\s*(\S+)/)?.[1] || null,
    прокруткаВбок: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }
})
console.log(JSON.stringify(shot, null, 1))

check(shot.кнопкаЕсть, 'кнопка отслеживания видна гостю')
check((shot.href || '').includes(order.id), 'ссылка ведёт в track-order с id заказа')
check(!(shot.href || '').includes(order.tracking_code), 'кода отслеживания в разметке страницы нет')
check(/Telegram/i.test(shot.заголовок || ''), `заголовок блока: «${shot.заголовок}»`)
check(!shot.обещаниеSms, 'обещания прислать SMS на странице больше нет')
check(!shot.прокруткаВбок, 'страница не разъезжается по ширине')
check(shot.номерНаСтранице === String(order.order_number),
  `номер на странице цифрами: «${shot.номерНаСтранице}» (в базе ${order.order_number})`)
check(/^\d+$/.test(shot.номерНаСтранице || ''), 'и никаких букв в нём')
check(errors.length === 0, `ошибок страницы: ${errors.length ? errors.join(' | ') : 'нет'}`)

await page.screenshot({ path: 'tracking-button.png' })
await browser.close()
await service.from('guest_checkouts').delete().eq('guest_email', MARK)
if (failed) process.exitCode = 1
