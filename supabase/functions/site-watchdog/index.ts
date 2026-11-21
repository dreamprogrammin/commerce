/**
 * Сторож доступности сайта (21 ноября 2026). Зовёт расписание «Site Watchdog»
 * каждые 5 минут (миграция 20261121120000_site_health.sql) — с адресом сайта
 * в теле. Открывает главную и каталог, пишет проверку в site_health_checks,
 * ведёт сбой в site_health_incidents и пишет владельцам в Telegram: после
 * второй неудачной проверки подряд и когда сайт снова открылся. Там же — за
 * неделю до продления платного сервиса (paid_services), с 10 до 21 по Алматы.
 *
 * ДОСТУП — как у sales-digest: заголовок x-internal-secret от базы
 * (_shared/internalAuth.ts). Наружу функция ничего не отдаёт, кроме сводки.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fromPgNet, isInternalCall } from '../_shared/internalAuth.ts'
import {
  almatyDay,
  awakeHour,
  checkPage,
  decide,
  dueRenewals,
  KEEP_DAYS,
  renewalText,
  WATCH_PATHS,
} from '../_shared/siteWatch.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (!isInternalCall(req, () => fromPgNet(req)))
    return json({ error: 'Forbidden' }, 403)

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const apiBase = Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let site = 'https://uhti.kz'
  try {
    const body = await req.json()
    if (typeof body?.site === 'string' && /^https?:\/\/[^/\s]+$/.test(body.site))
      site = body.site
  }
  catch {
    // Тела нет — боевой адрес
  }

  const now = new Date()
  const results = await Promise.all(WATCH_PATHS.map(p => checkPage(`${site}${p === '/' ? '/' : p}`)))
  const { error: insErr } = await db.from('site_health_checks').insert(results.map(r => ({ url: r.url, ok: r.ok, status: r.status, ms: r.ms, error: r.error })))
  if (insErr)
    console.error('❌ Проверка не записалась:', insErr.message)

  // Кому писать — принятым владельцам, как сводка продаж
  async function tell(text: string): Promise<number> {
    if (!botToken)
      return 0
    const { data } = await db.from('staff').select('telegram_user_id').eq('role', 'owner').eq('status', 'approved')
    let sent = 0
    for (const o of (data ?? []) as { telegram_user_id: number | null }[]) {
      if (!o.telegram_user_id)
        continue
      const res = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: o.telegram_user_id, text, disable_web_page_preview: true }),
      }).catch(() => null)
      const ok = res ? (await res.json().catch(() => null))?.ok : false
      if (ok)
        sent++
      else
        console.error('❌ Сообщение не ушло владельцу')
    }
    return sent
  }

  // Сбой
  const { data: openRow } = await db.from('site_health_incidents')
    .select('id, started_at, reason, alerted_at').is('ended_at', null).maybeSingle()
  const open = openRow ? { id: openRow.id, startedAt: openRow.started_at, reason: openRow.reason, alertedAt: openRow.alerted_at } : null
  const action = decide(site, open, results, now)
  let sent = 0
  if (action.kind === 'open') {
    await db.from('site_health_incidents').insert({ started_at: now.toISOString(), reason: action.reason })
  }
  else if (action.kind === 'alert') {
    sent = await tell(action.text)
    // Не дошло ни до кого — попробовать на следующей проверке
    await db.from('site_health_incidents').update({ reason: action.reason, ...(sent ? { alerted_at: now.toISOString() } : {}) }).eq('id', open!.id)
  }
  else if (action.kind === 'ongoing') {
    await db.from('site_health_incidents').update({ reason: action.reason }).eq('id', open!.id)
  }
  else if (action.kind === 'close') {
    if (action.text)
      sent = await tell(action.text)
    await db.from('site_health_incidents').update({ ended_at: now.toISOString(), ...(sent ? { recovered_alerted_at: now.toISOString() } : {}) }).eq('id', open!.id)
  }

  // Продления — днём, один раз на каждую дату
  let renewals = 0
  if (awakeHour(now)) {
    const { data: services } = await db.from('paid_services').select('id, name, plan, cost, currency, renews_on, reminded_for').not('renews_on', 'is', null)
    const due = dueRenewals((services ?? []).map((s: any) => ({ id: s.id, name: s.name, plan: s.plan, cost: s.cost == null ? null : Number(s.cost), currency: s.currency, renewsOn: s.renews_on, remindedFor: s.reminded_for })), now)
    if (due.length && await tell(renewalText(due, now))) {
      renewals = due.length
      for (const s of due)
        await db.from('paid_services').update({ reminded_for: s.renewsOn }).eq('id', s.id)
    }
  }

  // Старые проверки — долой
  await db.from('site_health_checks').delete().lt('checked_at', new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString())

  console.log(`🩺 ${site}: ${results.map(r => `${r.status ?? '—'} ${r.ms} мс`).join(', ')} → ${action.kind}; сообщений ${sent}, продлений ${renewals} (${almatyDay(now)})`)
  return json({ site, action: action.kind, results, sent, renewals })
})
