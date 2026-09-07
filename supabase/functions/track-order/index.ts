/**
 * Кнопка «Следить в Telegram» на странице заказа.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ. Ссылка на бота выглядит как
 * `https://t.me/<ник_бота>?start=t<код>`, то есть сайту нужно знать ник бота.
 * Держать его на фронте — значит завести ещё одну переменную окружения и
 * помнить про неё при смене бота. Ник знает сам бот: `getMe` возвращает его по
 * токену, который уже лежит в секретах функций. Поэтому кнопка ведёт сюда, а
 * функция отвечает редиректом.
 *
 * Заодно проверяем код: если заказа нет, отправлять человека в бота незачем —
 * там он получит «не нашёл такой заказ» и не поймёт, что случилось.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция track-order v1 инициализирована')

/** Ник бота меняется примерно никогда — держим в памяти экземпляра. */
let cachedUsername: string | null = null

async function botUsername(botToken: string, apiBase: string): Promise<string | null> {
  if (cachedUsername)
    return cachedUsername

  try {
    const res = await fetch(`${apiBase}/bot${botToken}/getMe`)
    const data = await res.json()
    cachedUsername = data?.result?.username ?? null
    return cachedUsername
  }
  catch (e) {
    console.error('getMe не ответил:', e)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const code = (url.searchParams.get('code') ?? '').trim().toLowerCase()
  /*
   * Заказ можно назвать и его id — так зовёт страница «заказ принят».
   *
   * Иначе никак: гостевой заказ лежит в `guest_checkouts`, а RLS отдаёт эту
   * таблицу только админам — сам покупатель свой заказ с сайта прочитать не
   * может и код отслеживания оттуда не возьмёт. Зато id у него есть, он в
   * адресе страницы. Наружу id не уходит: в ссылку на бота подставляется всё
   * тот же случайный код.
   */
  const orderId = (url.searchParams.get('order') ?? '').trim().toLowerCase()
  const site = Deno.env.get('SITE_URL') ?? 'https://uhti.kz'

  const byCode = /^[0-9a-f]{6,}$/.test(code)
  const byId = /^[0-9a-f-]{36}$/.test(orderId)

  if (!byCode && !byId) {
    return Response.redirect(site, 302)
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!
    const apiBase = Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    let trackingCode: string | null = null
    for (const table of ['orders', 'guest_checkouts']) {
      const query = supabase.from(table).select('tracking_code')
      const { data } = byCode
        ? await query.eq('tracking_code', code).maybeSingle()
        : await query.eq('id', orderId).maybeSingle()

      const row = data as { tracking_code: string | null } | null
      if (row?.tracking_code) {
        trackingCode = row.tracking_code
        break
      }
    }

    if (!trackingCode) {
      console.warn(`Заказ не найден: code=${code || '—'}, order=${orderId || '—'}`)
      return Response.redirect(site, 302)
    }

    const username = await botUsername(botToken, apiBase)
    if (!username) {
      console.error('Не удалось узнать ник бота')
      return Response.redirect(site, 302)
    }

    return Response.redirect(`https://t.me/${username}?start=t${trackingCode}`, 302)
  }
  catch (error) {
    console.error('❌ Ошибка track-order:', error)
    return Response.redirect(site, 302)
  }
})
