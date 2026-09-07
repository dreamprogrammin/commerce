/**
 * Брошенная корзина не должна утекать: маркетинговое напоминание в Telegram
 * ведёт на ОБЫЧНУЮ ссылку (не автологин), а статус заказа — по-прежнему на
 * автологин. Состав корзины в reminder_logs не хранится.
 *
 * Найдено аудитом 7 сентября 2026: любое уведомление с непустой ссылкой несло
 * magic-ссылку входа; пересланное сообщение = вход в чужой аккаунт.
 *   node check-cart-reminder-safe.mjs
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const CALLS = '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/tg-calls.jsonl'

const service = createClient(SUPA, SERVICE)
const calls = () => fs.existsSync(CALLS)
  ? fs.readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []

let failed = false
const check = (ok, label) => { if (!ok) failed = true; console.log(`${ok ? '✅' : '❌'} ${label}`) }

const { data: user } = await service.from('profiles')
  .select('id').not('telegram_chat_id', 'is', null).limit(1).single()

async function notify(type, link) {
  const marker = `Тест-${type}-${Math.floor(Math.random() * 1e6)}`
  await service.from('notifications').insert({
    user_id: user.id, type, title: marker, body: 'проверка', link,
  })
  // Ищем именно своё сообщение по маркеру в заголовке, а не первое подряд —
  // иначе соседние вставки в mock путаются.
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 400))
    const msg = calls().find(c => c.method === 'sendMessage' && (c.body?.text ?? '').includes(marker))
    if (msg)
      return (msg.body?.reply_markup?.inline_keyboard ?? []).flat()[0]?.url ?? null
  }
  return null
}

// ── маркетинг: обычная ссылка ─────────────────────────────────────────────
const cartUrl = await notify('abandoned_cart', '/cart')
check(cartUrl === 'https://uhti.kz/cart', `корзина ведёт на обычную ссылку: ${cartUrl}`)
check(!/auth\/magic/.test(cartUrl ?? ''), 'в напоминании о корзине НЕТ автологина')

const promoUrl = await notify('promotion', '/promo')
check(!/auth\/magic/.test(promoUrl ?? ''), `промо тоже без автологина: ${promoUrl}`)

// ── транзакционное: автологин по делу ─────────────────────────────────────
const orderUrl = await notify('order_status', '/profile/orders')
check(/auth\/magic\?token=/.test(orderUrl ?? ''), `статус заказа — автологин на месте: ${(orderUrl ?? '').slice(0, 45)}`)

const bonusUrl = await notify('bonus_earned', '/profile/bonuses')
check(/auth\/magic\?token=/.test(bonusUrl ?? ''), 'бонусы — автологин на месте')

// ── reminder_logs больше не хранит состав ─────────────────────────────────
try { await service.rpc('check_abandoned_carts') }
catch { /* функция void, ответ не важен */ }
const { data: logs } = await service.from('reminder_logs')
  .select('cart_snapshot').not('cart_snapshot', 'is', null).limit(1)
check((logs ?? []).length === 0, `состав корзины в reminder_logs не хранится (найдено с составом: ${(logs ?? []).length})`)

await service.from('notifications').delete().like('title', 'Тест-%')
if (failed) process.exitCode = 1
