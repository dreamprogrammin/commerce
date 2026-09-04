/**
 * Еженедельный отчёт по работе команды — владельцам в личку.
 *
 * Тот же текст, что бот показывает по команде `/report`; здесь он приходит сам
 * в понедельник утром за прошлую неделю. Расписание держит pg_cron (миграция
 * `20260904..._weekly_team_report.sql`), как и остальные регулярные задачи
 * этого проекта.
 *
 * ДОСТУП. Вызов разрешён запросу от pg_net (так же, как у
 * sync-order-status-to-telegram) либо с верным `secret` — им проверяют функцию
 * руками. Секрета в расписании нет намеренно: миграции лежат в git, и ключ из
 * них попал бы в репозиторий. Худшее, что даёт посторонний вызов, — лишний
 * отчёт владельцу в личку; наружу функция не отдаёт ничего.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildReport, type ReportPeriod, reportKeyboard } from '../_shared/teamReport.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log('✅ Функция team-report v1 инициализирована')

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

    let period: ReportPeriod = 'lw'
    try {
      const body = await req.json()
      if (body?.period === 'd' || body?.period === 'w' || body?.period === 'm' || body?.period === 'lw')
        period = body.period
    }
    catch {
      // Тела может не быть вовсе — тогда шлём отчёт за прошлую неделю.
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: owners } = await supabase
      .from('staff')
      .select('telegram_user_id, full_name')
      .eq('role', 'owner')
      .eq('status', 'approved')

    const recipients = (owners ?? []).filter((o: { telegram_user_id?: number }) => !!o.telegram_user_id)
    if (recipients.length === 0) {
      console.warn('⚠️ Некому слать отчёт: принятых владельцев нет')
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: 'no owners' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const text = await buildReport(supabase, period)
    let sent = 0

    for (const owner of recipients as Array<{ telegram_user_id: number }>) {
      const res = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: owner.telegram_user_id,
          text,
          parse_mode: 'Markdown',
          reply_markup: reportKeyboard(),
        }),
      })
      const result = await res.json()
      if (result.ok)
        sent++
      else
        console.error('Не удалось отправить отчёт:', JSON.stringify(result))
    }

    console.log(`📊 Отчёт (${period}) отправлен: ${sent} из ${recipients.length}`)

    return new Response(
      JSON.stringify({ success: true, period, sent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка'
    console.error('❌ Ошибка отчёта:', message)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
