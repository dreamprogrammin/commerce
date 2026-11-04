import type { TelegramClient, User } from '@mtcute/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import process from 'node:process'
import { isSessionGone, phoneLast4, telegramErrorText } from '~/utils/telegramLogin'

/**
 * Аккаунт Telegram для закрытых каналов поставщиков (4 ноября 2026).
 * Закрытый канал (t.me/+…) без аккаунта не читается. Владелец заводит
 * отдельный аккаунт (решено 3.11), вступает им в каналы поставщиков и входит
 * в него на странице «Аккаунт Telegram»: телефон → код из Telegram → пароль,
 * если включена двухэтапная проверка. Код и пароль идут на сервер и дальше в
 * Telegram; в чат их не присылают.
 *
 * Клиент — mtcute (@mtcute/node, MIT, версия закреплена): GramJS заброшен
 * (на npm «archived and no longer maintained»). Хранилище mtcute — в памяти:
 * между запросами сессия живёт строкой в Vault (telegram_session), на диск
 * ничего не пишется, и SQLite из @mtcute/node не загружается вовсе. Каждый
 * запрос — свой клиент: открыл, сделал, закрыл.
 *
 * Сама библиотека грузится только здесь и по требованию (loadMtcute):
 * статический импорт сборщик поднимал в общий чанк сервера, и ~0,9 с её
 * загрузки ложились бы на каждый холодный старт витрины.
 */
const loadMtcute = () => import('@mtcute/node')

/*
 * Секреты — миграция 20261104120000_telegram_account. Браузеру отсюда не
 * уходят ни сессия, ни телефон, ни api_hash.
 *
 * TELEGRAM_FAKE=1 — подделка Telegram для стража check-admin-telegram.mjs:
 * настоящих аккаунтов не трогает.
 */

export interface TgApp { apiId: number, apiHash: string }

/** Вход в процессе — между «прислать код» и «войти», в Vault (telegram_login). */
export interface PendingLogin {
  /** Временная сессия: ключом, которым запрошен код, и входят */
  session: string
  phone: string
  phoneCodeHash: string
  /** Куда отправлен код — тип из auth.sentCode */
  via: string
  /** Код принят, ждём пароль двухэтапной проверки */
  needPassword: boolean
  hint: string | null
  startedAt: string
}

export interface TgUser { id: number, displayName: string, username: string | null, phone: string | null }

export type InviteState
  = | { state: 'member', title: string, lastPostAt: string | null }
    | { state: 'not_member', title: string | null }
    | { state: 'expired' }

/** Что странице нужно от Telegram; настоящий — mtcute, для стража — подделка. */
interface TelegramPort {
  sendCode: (app: TgApp, phone: string) => Promise<{ session: string, phoneCodeHash: string, via: string }>
  signIn: (app: TgApp, login: PendingLogin, code: string) => Promise<{ user: TgUser, session: string } | { needPassword: true, session: string, hint: string | null }>
  checkPassword: (app: TgApp, login: PendingLogin, password: string) => Promise<{ user: TgUser, session: string }>
  logOut: (app: TgApp, session: string) => Promise<void>
  checkInvites: (app: TgApp, session: string, hashes: string[]) => Promise<Record<string, InviteState>>
}

/** Вход живёт столько: код Telegram к этому времени всё равно устаревает */
const LOGIN_TTL_MS = 15 * 60 * 1000
/** Дольше одна операция не ждёт: иначе функция Vercel висела бы до своего предела */
const CALL_TIMEOUT_MS = 40_000

// ---------- mtcute ----------

async function newClient(app: TgApp): Promise<TelegramClient> {
  const { MemoryStorage, TelegramClient } = await loadMtcute()
  return new TelegramClient({
    apiId: app.apiId,
    apiHash: app.apiHash,
    storage: new MemoryStorage(),
    disableUpdates: true,
    // Только ошибки: в журнал функции не должно попадать лишнее
    logLevel: 1,
    initConnectionOptions: { deviceModel: 'uhti.kz', appVersion: '1.0', langCode: 'ru', systemLangCode: 'ru' },
  })
}

async function withClient<T>(app: TgApp, session: string | null, fn: (tg: TelegramClient) => Promise<T>): Promise<T> {
  const tg = await newClient(app)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (session)
      await tg.importSession(session)
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(createError({ statusCode: 504, message: 'Telegram не ответил — попробуйте ещё раз' })), CALL_TIMEOUT_MS)
    })
    return await Promise.race([fn(tg), timeout])
  }
  finally {
    clearTimeout(timer)
    await tg.destroy().catch(() => {})
  }
}

function toUser(u: User): TgUser {
  return { id: u.id, displayName: u.displayName, username: u.username, phone: u.phoneNumber }
}

/** Код ответа Telegram у ошибки mtcute; null — ошибка не от Telegram */
async function rpcText(e: unknown): Promise<string | null> {
  const { tl } = await loadMtcute()
  return tl.RpcError.is(e) ? e.text : null
}

const mtcute: TelegramPort = {
  sendCode: (app, phone) => withClient(app, null, async (tg) => {
    const { SentCode } = await loadMtcute()
    const sent = await tg.sendCode({ phone })
    if (!(sent instanceof SentCode))
      throw createError({ statusCode: 409, message: 'Telegram впустил без кода — начните вход заново' })
    if (sent.type === 'email_required') {
      throw createError({
        statusCode: 409,
        message: 'Telegram просит сначала привязать к аккаунту почту для входа: в приложении Telegram — Настройки → Конфиденциальность → Почта для входа. Потом запросите код снова',
      })
    }
    return { session: await tg.exportSession(), phoneCodeHash: sent.phoneCodeHash, via: sent.type }
  }),

  signIn: (app, login, code) => withClient(app, login.session, async (tg) => {
    try {
      const user = await tg.signIn({ phone: login.phone, phoneCodeHash: login.phoneCodeHash, phoneCode: code })
      return { user: toUser(user), session: await tg.exportSession() }
    }
    catch (e) {
      if (await rpcText(e) !== 'SESSION_PASSWORD_NEEDED')
        throw e
      const hint = await tg.getPasswordHint().catch(() => null)
      return { needPassword: true as const, session: await tg.exportSession(), hint }
    }
  }),

  checkPassword: (app, login, password) => withClient(app, login.session, async (tg) => {
    const user = await tg.checkPassword(password)
    return { user: toUser(user), session: await tg.exportSession() }
  }),

  logOut: (app, session) => withClient(app, session, async (tg) => {
    await tg.logOut()
  }),

  checkInvites: (app, session, hashes) => withClient(app, session, async (tg) => {
    const out: Record<string, InviteState> = {}
    for (const hash of hashes) {
      try {
        const invite = await tg.call({ _: 'messages.checkChatInvite', hash })
        if (invite._ === 'chatInviteAlready' && invite.chat._ === 'channel') {
          const [last] = await tg.getHistory(invite.chat, { limit: 1 })
          out[hash] = { state: 'member', title: invite.chat.title, lastPostAt: last?.date.toISOString() ?? null }
        }
        else if (invite._ === 'chatInvite') {
          out[hash] = { state: 'not_member', title: invite.title }
        }
        else {
          out[hash] = { state: 'not_member', title: 'title' in invite.chat ? invite.chat.title : null }
        }
      }
      catch (e) {
        const text = await rpcText(e)
        if (text !== 'INVITE_HASH_EXPIRED' && text !== 'INVITE_HASH_INVALID')
          throw e
        out[hash] = { state: 'expired' }
      }
    }
    return out
  }),
}

// ---------- подделка для стража ----------

const FAKE_CODE = '12345'
const FAKE_PASSWORD = 'secret'
const fakeUser = (phone: string): TgUser => ({ id: 777000, displayName: 'Закуп Ухти', username: 'uhti_zakup', phone: phone.slice(1) })

/*
 * Номер на …0000 Telegram «не принимает», на …1 — с паролем; код 12345,
 * пароль secret. Приглашение на Member… — аккаунт в канале, на Expired… —
 * устарело, остальные — не вступил.
 */
// Ошибки — настоящие RpcError mtcute: их разбирает тот же failure()
async function fakeError(text: 'PHONE_NUMBER_INVALID' | 'PHONE_CODE_INVALID' | 'PASSWORD_HASH_INVALID'): Promise<never> {
  const { tl } = await loadMtcute()
  throw new tl.RpcError(400, text)
}

const fake: TelegramPort = {
  async sendCode(_app, phone) {
    if (phone.endsWith('0000'))
      return fakeError('PHONE_NUMBER_INVALID')
    return { session: `fake-temp-${phone}-${'t'.repeat(24)}`, phoneCodeHash: `hash${phoneLast4(phone)}`, via: 'app' }
  },
  async signIn(_app, login, code) {
    if (code !== FAKE_CODE)
      return fakeError('PHONE_CODE_INVALID')
    if (login.phone.endsWith('1'))
      return { needPassword: true, session: login.session, hint: 'кот' }
    return { user: fakeUser(login.phone), session: `fake-session-${login.phone}-${'s'.repeat(24)}` }
  },
  async checkPassword(_app, login, password) {
    if (password !== FAKE_PASSWORD)
      return fakeError('PASSWORD_HASH_INVALID')
    return { user: fakeUser(login.phone), session: `fake-session-${login.phone}-${'s'.repeat(24)}` }
  },
  async logOut() {},
  async checkInvites(_app, _session, hashes) {
    return Object.fromEntries(hashes.map(h => [h, h.startsWith('Member')
      ? { state: 'member', title: 'Закрытый опт', lastPostAt: '2026-11-04T05:00:00.000Z' }
      : h.startsWith('Expired') ? { state: 'expired' } : { state: 'not_member', title: 'Закрытый опт' }] as const))
  },
}

function telegram(): TelegramPort {
  return process.env.TELEGRAM_FAKE === '1' ? fake : mtcute
}

/** Ответ Telegram → ошибка для страницы; код Telegram — в data, для разбора. */
async function failure(e: unknown): Promise<Error> {
  const { tl } = await loadMtcute()
  if (tl.RpcError.is(e)) {
    // FLOOD_WAIT_30 mtcute отдаёт как text 'FLOOD_WAIT_%d' и seconds: 30
    const seconds = 'seconds' in e && typeof e.seconds === 'number' ? e.seconds : undefined
    return createError({ statusCode: 400, message: telegramErrorText(e.text, seconds), data: { telegram: e.text } })
  }
  if (typeof (e as { statusCode?: unknown })?.statusCode === 'number')
    return e as Error
  console.error('[telegram]', e)
  return createError({ statusCode: 502, message: 'Не удалось связаться с Telegram — попробуйте ещё раз' })
}

// ---------- Vault ----------

type SecretName = 'api_id' | 'api_hash' | 'session' | 'login'

/*
 * Миграции 20261104120000 ещё нет: превью с `dev` смотрит в боевую базу до её
 * применения. PostgREST: PGRST202 — нет функции, PGRST205 — нет таблицы;
 * Postgres: 42883, 42P01.
 */
export function telegramNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code ?? '')
}

function dbError(error: { code?: string, message: string }) {
  return telegramNotInstalled(error)
    ? createError({ statusCode: 409, message: 'Аккаунта Telegram ещё нет в базе: нужна миграция 20261104120000_telegram_account' })
    : createError({ statusCode: 500, message: error.message })
}

async function getSecret(db: SupabaseClient, name: SecretName): Promise<string | null> {
  const { data, error } = await db.rpc('telegram_secret_get', { p_name: name })
  if (error)
    throw dbError(error)
  return typeof data === 'string' && data ? data : null
}

async function setSecret(db: SupabaseClient, name: SecretName, value: string, adminId: string) {
  const { error } = await db.rpc('telegram_secret_set', { p_name: name, p_value: value, p_admin: adminId })
  if (error)
    throw dbError(error)
}

async function deleteSecret(db: SupabaseClient, name: SecretName) {
  const { error } = await db.rpc('telegram_secret_delete', { p_name: name })
  if (error)
    throw dbError(error)
}

async function loadApp(db: SupabaseClient): Promise<TgApp> {
  const [id, hash] = await Promise.all([getSecret(db, 'api_id'), getSecret(db, 'api_hash')])
  if (!id || !hash)
    throw createError({ statusCode: 409, message: 'Сначала задайте api_id и api_hash приложения с my.telegram.org' })
  return { apiId: Number(id), apiHash: hash }
}

/** Вход в процессе; устаревший — как не начатый. */
async function loadLogin(db: SupabaseClient): Promise<PendingLogin | null> {
  const raw = await getSecret(db, 'login')
  if (!raw)
    return null
  let login: PendingLogin
  try {
    login = JSON.parse(raw)
  }
  catch {
    return null
  }
  return Date.now() - Date.parse(login.startedAt) < LOGIN_TTL_MS ? login : null
}

const ACCOUNT_COLUMNS = 'user_id, display_name, username, phone_last4, logged_in_at'

function accountView(row: { display_name: string, username: string | null, phone_last4: string | null, logged_in_at: string }) {
  return { displayName: row.display_name, username: row.username, phoneLast4: row.phone_last4, loggedInAt: row.logged_in_at }
}

/** Сессии больше нет у Telegram — стереть её и строку аккаунта, чтобы страница позвала войти заново. */
async function forgetSession(db: SupabaseClient) {
  await deleteSecret(db, 'session')
  await db.from('telegram_account').delete().eq('id', true)
}

// ---------- шаги страницы ----------

/** Что видит страница: секретов в ответе нет — только «задан», шаг входа и кто вошёл. */
export async function telegramStatus(db: SupabaseClient) {
  const [{ data: secrets, error }, { data: account, error: accountError }, { data: channels, error: channelsError }] = await Promise.all([
    db.rpc('telegram_secrets_status'),
    db.from('telegram_account').select(ACCOUNT_COLUMNS).maybeSingle(),
    db.from('supplier_channels').select('id, title, invite_hash, suppliers(name)').not('invite_hash', 'is', null).order('created_at'),
  ])
  if (telegramNotInstalled(error) || telegramNotInstalled(accountError))
    return { installed: false as const }
  if (error || accountError)
    throw dbError((error ?? accountError)!)
  if (channelsError && channelsError.code !== 'PGRST205' && channelsError.code !== '42P01')
    throw createError({ statusCode: 500, message: channelsError.message })

  const rows = (secrets ?? []) as { name: SecretName, updated_at: string }[]
  const has = (name: SecretName) => rows.find(r => r.name === name)
  const session = has('session')
  const login = !session && has('login') ? await loadLogin(db) : null
  return {
    installed: true as const,
    // Страж check-admin-telegram.mjs не вводит номера, пока не увидит подделку
    ...(process.env.TELEGRAM_FAKE === '1' ? { fake: true as const } : {}),
    app: { configured: Boolean(has('api_id') && has('api_hash')), updatedAt: has('api_hash')?.updated_at ?? null },
    login: login && {
      step: login.needPassword ? 'password' as const : 'code' as const,
      phoneLast4: phoneLast4(login.phone),
      via: login.via,
      hint: login.hint,
      startedAt: login.startedAt,
    },
    // Сессия есть, а строки нет — вход дописался не до конца: подключён, имени не знаем
    account: session
      ? account ? accountView(account) : { displayName: 'имя не записано', username: null, phoneLast4: null, loggedInAt: session.updated_at }
      : null,
    channels: ((channels ?? []) as unknown as { id: string, title: string, suppliers: { name?: string } | null }[])
      .map(c => ({ id: c.id, title: c.title, supplierName: c.suppliers?.name ?? '' })),
  }
}

export async function saveTelegramApp(db: SupabaseClient, adminId: string, apiId: string, apiHash: string) {
  await setSecret(db, 'api_id', apiId, adminId)
  await setSecret(db, 'api_hash', apiHash, adminId)
}

/** Шаг 1: Telegram присылает код. Временная сессия и phone_code_hash — в Vault до шага 2. */
export async function startTelegramLogin(db: SupabaseClient, adminId: string, phone: string) {
  if (await getSecret(db, 'session'))
    throw createError({ statusCode: 409, message: 'Аккаунт уже подключён — чтобы войти в другой, сначала выйдите' })
  const app = await loadApp(db)
  const sent = await telegram().sendCode(app, phone).catch(async (e) => {
    throw await failure(e)
  })
  const login: PendingLogin = { ...sent, phone, needPassword: false, hint: null, startedAt: new Date().toISOString() }
  await setSecret(db, 'login', JSON.stringify(login), adminId)
  return { via: sent.via, phoneLast4: phoneLast4(phone) }
}

/*
 * Подключён ли аккаунт — по сессии в Vault; строка telegram_account — только
 * чтобы показать, кто это. Поэтому сначала строка, потом сессия: сорвётся
 * запись строки — сессии нет, и вход просто повторяют; сорвётся запись
 * сессии — строку перезапишет следующий вход.
 */
async function finishLogin(db: SupabaseClient, adminId: string, user: TgUser, session: string) {
  const { data, error } = await db.from('telegram_account').upsert({
    id: true,
    user_id: user.id,
    display_name: user.displayName.slice(0, 200) || 'без имени',
    username: user.username && /^\w{3,32}$/.test(user.username) ? user.username : null,
    phone_last4: user.phone ? phoneLast4(user.phone) : null,
    logged_in_at: new Date().toISOString(),
    logged_in_by: adminId,
  }).select(ACCOUNT_COLUMNS).single()
  if (error)
    throw dbError(error)
  await setSecret(db, 'session', session, adminId)
  await deleteSecret(db, 'login')
  return { account: accountView(data) }
}

async function pendingLogin(db: SupabaseClient, step: 'code' | 'password') {
  const login = await loadLogin(db)
  if (!login)
    throw createError({ statusCode: 409, message: 'Вход не начат или устарел — запросите код заново' })
  if (step === 'password' && !login.needPassword)
    throw createError({ statusCode: 409, message: 'Сначала введите код из Telegram' })
  return login
}

/** Шаг 2: код. Включена двухэтапная проверка — дальше пароль. */
export async function submitTelegramCode(db: SupabaseClient, adminId: string, code: string) {
  const login = await pendingLogin(db, 'code')
  const app = await loadApp(db)
  const res = await telegram().signIn(app, login, code).catch(async (e) => {
    throw await failure(e)
  })
  if ('needPassword' in res) {
    await setSecret(db, 'login', JSON.stringify({ ...login, session: res.session, needPassword: true, hint: res.hint }), adminId)
    return { step: 'password' as const, hint: res.hint }
  }
  return { step: 'done' as const, ...await finishLogin(db, adminId, res.user, res.session) }
}

/** Шаг 3: пароль двухэтапной проверки. */
export async function submitTelegramPassword(db: SupabaseClient, adminId: string, password: string) {
  const login = await pendingLogin(db, 'password')
  const app = await loadApp(db)
  const res = await telegram().checkPassword(app, login, password).catch(async (e) => {
    throw await failure(e)
  })
  return { step: 'done' as const, ...await finishLogin(db, adminId, res.user, res.session) }
}

export async function cancelTelegramLogin(db: SupabaseClient) {
  await deleteSecret(db, 'login')
}

/** Выйти: сессия закрывается у Telegram и стирается здесь. Telegram не ответил — всё равно стираем. */
export async function logoutTelegram(db: SupabaseClient) {
  const session = await getSecret(db, 'session')
  if (session) {
    const app = await loadApp(db).catch(() => null)
    if (app)
      await telegram().logOut(app, session).catch(async e => console.error('[telegram] logOut', await rpcText(e) ?? e))
  }
  await deleteSecret(db, 'login')
  await forgetSession(db)
}

/** Видит ли аккаунт закрытые каналы поставщиков: вступил ли, когда последний пост. */
export async function checkTelegramChannels(db: SupabaseClient) {
  const session = await getSecret(db, 'session')
  if (!session)
    throw createError({ statusCode: 409, message: 'Сначала войдите в аккаунт Telegram' })
  const app = await loadApp(db)
  const { data, error } = await db.from('supplier_channels').select('id, invite_hash').not('invite_hash', 'is', null)
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  const rows = (data ?? []) as { id: string, invite_hash: string }[]
  if (!rows.length)
    return { channels: [] }
  let states: Record<string, InviteState>
  try {
    states = await telegram().checkInvites(app, session, rows.map(r => r.invite_hash))
  }
  catch (e) {
    const text = await rpcText(e)
    if (text && isSessionGone(text))
      await forgetSession(db)
    throw await failure(e)
  }
  return { channels: rows.map(r => ({ id: r.id, ...states[r.invite_hash] ?? { state: 'expired' as const } })) }
}
