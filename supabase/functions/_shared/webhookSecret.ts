/**
 * Поставить вебхуку бота секретный токен — `secret_token` в setWebhook.
 *
 * Telegram шлёт его в каждом обновлении заголовком
 * X-Telegram-Bot-Api-Secret-Token, и telegram-webhook сверяет его с
 * TELEGRAM_WEBHOOK_SECRET (`isTelegramCall`, _shared/internalAuth.ts). Без
 * этого кто угодно мог прислать поддельное обновление — например, нажатие
 * кнопки заказа от имени менеджера (19 октября 2026).
 *
 * Зачем через функцию. Токен бота лежит только в секретах функций — снаружи
 * его нет, а setWebhook требует именно его. Вызов:
 *   GET …/telegram-webhook?action=secure-webhook&key=<TELEGRAM_WEBHOOK_SECRET>
 * Ключ — тот же секрет: кто его знает, тот и так может слать обновления.
 * Адрес, max_connections и allowed_updates берутся у текущего вебхука —
 * меняется только секрет. Ожидающие обновления не сбрасываются.
 */
import { safeEqual } from './internalAuth.ts'

function apiBase(): string {
  return Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export async function secureWebhook(req: Request, botToken: string): Promise<Response> {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  const url = new URL(req.url)
  if (url.searchParams.get('action') !== 'secure-webhook' || !secret
    || !safeEqual(url.searchParams.get('key') ?? '', secret)) {
    return new Response('Not Found', { status: 404 })
  }

  const api = `${apiBase()}/bot${botToken}`
  const info = await (await fetch(`${api}/getWebhookInfo`)).json()
  const current = info?.result
  if (!current?.url)
    return json({ ok: false, error: 'у бота нет вебхука — ставить секрет некуда' }, 409)

  const params: Record<string, unknown> = { url: current.url, secret_token: secret }
  if (current.max_connections)
    params.max_connections = current.max_connections
  if (Array.isArray(current.allowed_updates))
    params.allowed_updates = current.allowed_updates

  const set = await (await fetch(`${api}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })).json()
  const after = (await (await fetch(`${api}/getWebhookInfo`)).json())?.result ?? {}

  return json({
    ok: Boolean(set?.ok),
    description: set?.description ?? null,
    url: after.url ?? null,
    url_unchanged: after.url === current.url,
    pending_update_count: after.pending_update_count ?? null,
    last_error_message: after.last_error_message ?? null,
  }, set?.ok ? 200 : 502)
}
