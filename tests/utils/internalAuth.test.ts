import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Проверка вызывающего у функций бота (19 октября 2026). До неё функции,
 * которые зовёт база, пускали любого с «pg_net» в User-Agent, а
 * send-user-telegram и telegram-webhook — вообще любого.
 */
const env = new Map<string, string>()
beforeEach(() => {
  env.clear()
  vi.stubGlobal('Deno', { env: { get: (k: string) => env.get(k) } })
})
afterEach(() => vi.unstubAllGlobals())

const auth = () => import('../../supabase/functions/_shared/internalAuth')
const req = (headers: Record<string, string> = {}, url = 'https://x.test/fn') => new Request(url, { headers })

describe('internalAuth', () => {
  it('safeEqual сравнивает строки целиком', async () => {
    const { safeEqual } = await auth()
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(true)
  })

  it('пока секрета нет в окружении — прежнее поведение', async () => {
    const { fromPgNet, isInternalCall } = await auth()
    const r = req({ 'user-agent': 'pg_net/0.14.0' })
    expect(isInternalCall(r, () => fromPgNet(r))).toBe(true)
    expect(isInternalCall(req(), () => false)).toBe(false)
  })

  it('с секретом — нужен заголовок, «pg_net» в User-Agent больше не пропуск', async () => {
    env.set('INTERNAL_FUNCTIONS_SECRET', 's3cret')
    const { fromPgNet, isInternalCall } = await auth()
    const forged = req({ 'user-agent': 'pg_net/0.14.0' })
    expect(isInternalCall(forged, () => fromPgNet(forged))).toBe(false)
    expect(isInternalCall(req({ 'x-internal-secret': 'wrong' }), () => true)).toBe(false)
    expect(isInternalCall(req({ 'x-internal-secret': 's3cret' }), () => false)).toBe(true)
  })

  it('internalHeaders — пусто без секрета, заголовок с ним', async () => {
    const { internalHeaders } = await auth()
    expect(internalHeaders()).toEqual({})
    env.set('INTERNAL_FUNCTIONS_SECRET', 's3cret')
    expect(internalHeaders()).toEqual({ 'x-internal-secret': 's3cret' })
  })

  it('сервисный ключ соседней функции', async () => {
    env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
    const { hasServiceKey } = await auth()
    expect(hasServiceKey(req({ authorization: 'Bearer service-key' }))).toBe(true)
    expect(hasServiceKey(req({ authorization: 'Bearer anon-key' }))).toBe(false)
    expect(hasServiceKey(req())).toBe(false)
  })

  it('у Telegram: без секрета пускаем, с секретом — только по заголовку', async () => {
    const { isTelegramCall } = await auth()
    expect(isTelegramCall(req())).toBe(true)
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    expect(isTelegramCall(req())).toBe(false)
    expect(isTelegramCall(req({ 'x-telegram-bot-api-secret-token': 'nope' }))).toBe(false)
    expect(isTelegramCall(req({ 'x-telegram-bot-api-secret-token': 'tg-secret' }))).toBe(true)
  })
})

describe('secureWebhook', () => {
  const calls: { method: string, body: unknown }[] = []
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const method = url.split('/').pop()!
      calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null })
      const result = method === 'setWebhook'
        ? true
        : { url: 'https://proj.supabase.co/functions/v1/telegram-webhook', max_connections: 40, allowed_updates: ['message', 'callback_query'], pending_update_count: 2 }
      return new Response(JSON.stringify({ ok: true, result }))
    })
  })

  const secure = async (url: string) => {
    const { secureWebhook } = await import('../../supabase/functions/_shared/webhookSecret')
    return secureWebhook(req({}, url), 'bot-token')
  }

  it('без секрета в окружении или с чужим ключом — 404, Telegram не трогаем', async () => {
    expect((await secure('https://x.test/fn?action=secure-webhook&key=any')).status).toBe(404)
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    expect((await secure('https://x.test/fn?action=secure-webhook&key=wrong')).status).toBe(404)
    expect((await secure('https://x.test/fn?key=tg-secret')).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('с верным ключом — тот же адрес и настройки, меняется только секрет', async () => {
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    const res = await secure('https://x.test/fn?action=secure-webhook&key=tg-secret')
    expect(res.status).toBe(200)
    const set = calls.find(c => c.method === 'setWebhook')!
    expect(set.body).toEqual({
      url: 'https://proj.supabase.co/functions/v1/telegram-webhook',
      secret_token: 'tg-secret',
      max_connections: 40,
      allowed_updates: ['message', 'callback_query'],
    })
    const out = await res.json()
    expect(out.url_unchanged).toBe(true)
    expect(JSON.stringify(out)).not.toContain('tg-secret')
  })
})
