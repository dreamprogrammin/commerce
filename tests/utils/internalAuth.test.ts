import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  const secure = async (key?: string, url = 'https://x.test/fn?action=secure-webhook') => {
    const { secureWebhook } = await import('../../supabase/functions/_shared/webhookSecret')
    return secureWebhook(req(key === undefined ? {} : { 'x-webhook-key': key }, url), 'bot-token')
  }

  it('без секрета в окружении или с чужим ключом — 404, Telegram не трогаем', async () => {
    expect((await secure('any')).status).toBe(404)
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    expect((await secure('wrong')).status).toBe(404)
    expect((await secure()).status).toBe(404)
    expect((await secure('tg-secret', 'https://x.test/fn')).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('ключ в адресе не принимается — адрес оседает в журнале функций', async () => {
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    expect((await secure(undefined, 'https://x.test/fn?action=secure-webhook&key=tg-secret')).status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('с верным ключом — тот же адрес и настройки, меняется только секрет', async () => {
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    const res = await secure('tg-secret')
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

/*
 * Кто ставит вебхук, обязан передать secret_token. Иначе Telegram перестаёт
 * слать заголовок, и при заведённом TELEGRAM_WEBHOOK_SECRET telegram-webhook
 * отвечает 401 на всё: бот глохнет. Так сделала бы команда `/setup`
 * (19 октября 2026), а поднять бота ею же нельзя — она сама приходит через
 * вебхук.
 */
describe('setWebhook с секретом', () => {
  it('webhookSecretParams — secret_token, пока секрет заведён', async () => {
    const { webhookSecretParams } = await import('../../supabase/functions/_shared/webhookSecret')
    expect(webhookSecretParams()).toEqual({})
    env.set('TELEGRAM_WEBHOOK_SECRET', 'tg-secret')
    expect(webhookSecretParams()).toEqual({ secret_token: 'tg-secret' })
  })

  const root = join(process.cwd(), 'supabase/functions')
  const sites = (readdirSync(root, { recursive: true, encoding: 'utf8' }))
    .filter(file => file.endsWith('.ts'))
    .flatMap((file) => {
      const src = readFileSync(join(root, file), 'utf8')
      return [...src.matchAll(/\/setWebhook`/g)].map((m) => {
        // Вызов — от адреса до следующего fetch: тело запроса целиком.
        const rest = src.slice(m.index)
        const next = rest.indexOf('fetch(')
        return {
          where: `${file}:${src.slice(0, m.index).split('\n').length}`,
          call: next === -1 ? rest : rest.slice(0, next),
        }
      })
    })

  it('вызовы setWebhook найдены, и `/setup` среди них', () => {
    expect(sites.map(s => s.where)).toEqual(expect.arrayContaining([
      expect.stringMatching(/^telegram-webhook\/index\.ts:/),
      expect.stringMatching(/^_shared\/webhookSecret\.ts:/),
    ]))
  })

  it.each(sites)('$where передаёт secret_token', ({ call }) => {
    expect(call).toContain('webhookSecretParams()')
  })
})

/*
 * `/setup` выполнял любой, кто напишет боту: вебхук, команды и меню ставились
 * заново, а в рабочий чат уходило «Кнопки под полем ввода…» (20 октября 2026,
 * владелец: «ограничить»). Поведение целиком — check-setup-owner-only.mjs на
 * локальном стенде; здесь — что проверка не уехала ниже первого вызова Telegram.
 */
describe('/setup — только владельцу', () => {
  it('проверка владельца раньше первого обращения к Telegram', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/telegram-webhook/index.ts'), 'utf8')
    const block = src.slice(src.indexOf('=== \'/setup\''))
    const gate = block.indexOf('isOwner(')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(block.indexOf('fetch('))
  })
})
