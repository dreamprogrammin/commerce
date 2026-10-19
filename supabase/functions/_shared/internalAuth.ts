/**
 * Кто зовёт функцию: база (триггер, расписание), другая функция или Telegram.
 *
 * Зачем (19 октября 2026). Функции, которые зовёт база, стоят с
 * verify_jwt = false — pg_net ходит без ключа, — и «защитой» была проверка,
 * что в User-Agent есть «pg_net». Она подделывается одной строкой: через
 * sync-order-status-to-telegram можно было переписать любое сообщение бота в
 * чате магазина (id сообщения и статус берутся из тела), через
 * send-user-telegram — написать от имени бота любому chat_id, через
 * telegram-webhook — прислать поддельное нажатие кнопки от имени менеджера.
 *
 * Теперь:
 *  • база шлёт заголовок `x-internal-secret` со значением из Vault (миграция
 *    20261019120000), функции сверяют его с INTERNAL_FUNCTIONS_SECRET;
 *  • Telegram шлёт `X-Telegram-Bot-Api-Secret-Token` — тот, что передан в
 *    setWebhook (`secret_token`), функция сверяет его с TELEGRAM_WEBHOOK_SECRET.
 *
 * Пока секрета нет в окружении функций — прежнее поведение (`legacy`). Так
 * функции можно выкатить в любой момент, а включает проверку заведение
 * секрета — и только ПОСЛЕ миграции: иначе функции потребуют заголовок,
 * которого триггеры ещё не шлют.
 */

export const INTERNAL_HEADER = 'x-internal-secret'
export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

/** Сравнение без утечки по времени: шагов столько же при любом совпадении. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length)
    return false
  let diff = 0
  for (let i = 0; i < a.length; i++)
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Прежний признак вызова из базы — только для переходного периода. */
export function fromPgNet(req: Request): boolean {
  return (req.headers.get('user-agent') || '').toLowerCase().includes('pg_net')
}

/** Вызов от базы или от другой функции с общим секретом. */
export function isInternalCall(req: Request, legacy: () => boolean): boolean {
  const expected = Deno.env.get('INTERNAL_FUNCTIONS_SECRET')
  if (!expected)
    return legacy()
  return safeEqual(req.headers.get(INTERNAL_HEADER) ?? '', expected)
}

/** Заголовок для вызова соседней функции — пустой, пока секрет не заведён. */
export function internalHeaders(): Record<string, string> {
  const secret = Deno.env.get('INTERNAL_FUNCTIONS_SECRET')
  return secret ? { [INTERNAL_HEADER]: secret } : {}
}

/** Вызов с сервисным ключом — так соседние функции зовут send-user-telegram. */
export function hasServiceKey(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!key)
    return false
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${key}`)
}

/** Обновление пришло от Telegram — по секрету из setWebhook. */
export function isTelegramCall(req: Request): boolean {
  const expected = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!expected)
    return true
  return safeEqual(req.headers.get(TELEGRAM_SECRET_HEADER) ?? '', expected)
}

export function forbidden(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
