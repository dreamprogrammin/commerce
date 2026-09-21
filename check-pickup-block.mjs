/**
 * Пункт самовывоза виден покупателю на оформлении.
 *
 * Блок с адресом рисуется только когда в `pickup_points` есть активная
 * запись. Таблица была пуста, и человек выбирал самовывоз, не узнавая, куда
 * ехать. Страж проходит путь гостем: товар → корзина → оформление →
 * самовывоз, и ищет адрес с номером дома и часы.
 *
 * Заказ НЕ оформляется — доходим до формы и останавливаемся.
 *
 *   BASE=http://localhost:3100 node check-pickup-block.mjs
 */
import os from 'node:os'
import process from 'node:process'
import { chromium, devices } from 'playwright'

const SCRATCH = process.env.SC || os.tmpdir()
const BASE = process.env.BASE || 'http://localhost:3000'

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ ...devices['Pixel 5'] })).newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message.slice(0, 120)))

await page.goto(BASE, { waitUntil: 'load', timeout: 120000 })
await page.waitForTimeout(2500)

// Товар в корзину — кнопкой карточки, без входа.
const add = page.locator('button.pc-add').first()
await add.scrollIntoViewIfNeeded()
await add.click()
await page.waitForTimeout(2000)

await page.goto(`${BASE}/checkout`, { waitUntil: 'load', timeout: 120000 })
await page.waitForTimeout(3000)

/*
 * Сначала закрыть окно «Получите подарок!» — оно всплывает на оформлении и
 * накрывает выбор доставки. Без этого страж жал сквозь модалку и краснел,
 * хотя блок работает.
 */
const noThanks = page.getByText(/Нет, спасибо/i).first()
if (await noThanks.count()) {
  await noThanks.click().catch(() => {})
  await page.waitForTimeout(1200)
}

// Выбрать самовывоз: подписи у радио-кнопок разные, ищем по тексту.
const pickup = page.getByText(/Забрать самовывозом|Самовывоз/i).first()
check(await pickup.count() > 0, 'на оформлении есть выбор самовывоза')
if (await pickup.count()) {
  await pickup.scrollIntoViewIfNeeded().catch(() => {})
  await pickup.click().catch(() => {})
  await page.waitForTimeout(2500)
}

const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
check(/Амангельды, 100/.test(text), `адрес с номером дома виден: ${/Амангельды, 100/.test(text) ? 'да' : 'НЕТ'}`)
check(/9:00 до 22:00/.test(text), `часы видны: ${(text.match(/ежедневно[^|]{0,30}/) ?? ['—'])[0]}`)
check(errors.length === 0, `ошибок страницы: ${errors.length}${errors.length ? ` — ${errors[0]}` : ''}`)

await page.screenshot({ path: `${SCRATCH}/pickup-block.png`, fullPage: true })
console.log(`снимок: ${SCRATCH}/pickup-block.png`)
await browser.close()
process.exit(failed ? 1 : 0)
