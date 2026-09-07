/**
 * Сводка по продажам владельцам — дважды в день.
 *
 * Расписание держит pg_cron (миграция `20260904170000_sales_plans.sql`):
 * 09:00 и 22:00 по Алматы. Тот же текст приходит по команде `/sales` в боте —
 * считает его общий модуль `_shared/salesDigest.ts`.
 *
 * ДОСТУП — как у team-report: запрос от pg_net либо верный `secret`. Наружу
 * функция ничего не отдаёт, худшее от постороннего вызова — лишняя сводка
 * владельцу в личку.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildDigest, type DigestSlot } from '../_shared/salesDigest.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция sales-digest v1 инициализирована')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const apiBase = Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'

    if (!botToken)
      throw new Error('Отсутствует TELEGRAM_BOT_TOKEN')

    const url = new URL(req.url)
    const providedSecret = url.searchParams.get('secret')
    const fromCron = (req.headers.get('user-agent') || '').toLowerCase().includes('pg_net')

    if (!fromCron && (!adminSecret || providedSecret !== adminSecret)) {
      console.error('❌ Вызов не от расписания и без секрета')
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 },
      )
    }

    let slot: DigestSlot = 'morning'
    try {
      const body = await req.json()
      if (body?.slot === 'evening')
        slot = 'evening'
    }
    catch {
      // Тела может не быть — тогда утренняя сводка.
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: owners } = await supabase
      .from('staff')
      .select('telegram_user_id')
      .eq('role', 'owner')
      .eq('status', 'approved')

    const recipients = (owners ?? []).filter((o: { telegram_user_id?: number }) => !!o.telegram_user_id)
    if (recipients.length === 0) {
      console.warn('⚠️ Некому слать сводку: принятых владельцев нет')
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: 'no owners' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const text = await buildDigest(supabase, slot)
    let sent = 0

    for (const owner of recipients as Array<{ telegram_user_id: number }>) {
      const res = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: owner.telegram_user_id,
          text,
          parse_mode: 'Markdown',
        }),
      })
      const result = await res.json()
      if (result.ok)
        sent++
      else
        console.error('Не удалось отправить сводку:', JSON.stringify(result))
    }

    console.log(`📈 Сводка (${slot}) отправлена: ${sent} из ${recipients.length}`)

    return new Response(
      JSON.stringify({ success: true, slot, sent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Ошибка сводки:', message)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
