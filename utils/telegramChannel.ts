/**
 * Каналы поставщиков в Telegram (3 ноября 2026): ссылка из поля «Каналы в
 * Telegram» карточки поставщика → что это за канал. Общее для страницы
 * (мгновенная подсказка до запроса) и сервера (он проверяет канал у Telegram
 * и пишет в базу — server/utils/telegramWeb.ts).
 *
 * Открытый канал узнаётся по имени и читается без аккаунта: t.me/s/<имя>.
 * Закрытый — только по ссылке-приглашению t.me/+<код>; читать его сможет
 * лишь аккаунт-участник.
 */

export type ChannelLink
  = | { kind: 'public', username: string }
    | { kind: 'invite', hash: string }
    | { kind: 'invalid', reason: string }

/** Результат проверки канала у Telegram — его отдаёт сервер. */
export interface ChannelCheck {
  /** Имя открытого канала — в нижнем регистре; null — канал по приглашению */
  username: string | null
  /** Код приглашения закрытого канала (регистр значим); null — открытый */
  inviteHash: string | null
  title: string
  type: 'channel' | 'group'
  /** Посты видны без аккаунта на t.me/s/<имя> */
  webPreview: boolean
  /** Подписчики канала или участники группы; null — Telegram не показал */
  members: number | null
  /** Последний пост, ISO; только для канала с просмотром без аккаунта */
  lastPostAt: string | null
  /** Канал уже записан за поставщиком — за каким */
  existing: { supplierId: string, supplierName: string } | null
}

/*
 * Имена у Telegram — латиница, цифры и подчёркивание, с буквы; обычно от 5
 * знаков, коллекционные (Fragment) — от 4. Регистр не важен.
 */
const USERNAME = /^[a-z]\w{3,31}$/i
const INVITE = /^[\w-]{10,64}$/
// Служебные пути t.me — не имена каналов
const RESERVED = new Set(['joinchat', 'addstickers', 'addemoji', 'addtheme', 'addlist', 'share', 'proxy', 'socks', 'setlanguage', 'login', 'boost', 'contact', 'invoice', 'confirmphone'])

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i

/** Что написал человек: ссылка, @имя или просто имя → канал или причина отказа. */
export function parseChannelLink(input: string): ChannelLink {
  const raw = input.trim()
  if (!raw)
    return { kind: 'invalid', reason: 'Вставьте ссылку на канал' }

  if (raw.startsWith('@'))
    return byUsername(raw.slice(1))

  // tg://resolve?domain=<имя>, tg://join?invite=<код>
  const [, action, query] = raw.match(/^tg:\/\/(resolve|join)\?(.*)$/i) ?? []
  if (action) {
    const params = new URLSearchParams(query)
    if (action.toLowerCase() === 'join')
      return byInvite(params.get('invite') ?? '')
    return byUsername(params.get('domain') ?? '')
  }

  let url: URL | null = null
  if (/^[\w.-]+\.[a-z]{2,}\//i.test(raw) || /^https?:\/\//i.test(raw)) {
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    }
    catch {
      return { kind: 'invalid', reason: 'Не похоже на ссылку на канал Telegram' }
    }
  }
  if (!url)
    return byUsername(raw)

  // <имя>.t.me — так Telegram тоже даёт ссылку на канал
  const sub = url.hostname.match(/^([\w-]+)\.t\.me$/i)?.[1]
  if (sub && sub.toLowerCase() !== 'www')
    return byUsername(sub)
  if (!HOSTS.test(url.hostname))
    return { kind: 'invalid', reason: 'Нужна ссылка на Telegram: t.me/имя или t.me/+приглашение' }

  const parts = url.pathname.split('/').filter(Boolean)
  const [first = '', second = ''] = parts
  if (first.startsWith('+'))
    return byInvite(first.slice(1))
  if (first.toLowerCase() === 'joinchat')
    return byInvite(second)
  if (first.toLowerCase() === 'c')
    return { kind: 'invalid', reason: 'Это ссылка на пост закрытого канала — по ней канал не найти. Нужна ссылка-приглашение t.me/+…' }
  // t.me/s/<имя> — просмотр канала без аккаунта
  if (first.toLowerCase() === 's')
    return byUsername(second)
  // t.me/<имя> и t.me/<имя>/<номер поста>
  return byUsername(first)
}

function byUsername(name: string): ChannelLink {
  if (!USERNAME.test(name) || RESERVED.has(name.toLowerCase()))
    return { kind: 'invalid', reason: 'Имя канала — латиница, цифры и «_», от 4 знаков: t.me/имя или @имя' }
  return { kind: 'public', username: name.toLowerCase() }
}

function byInvite(hash: string): ChannelLink {
  // t.me/+77011234567 — ссылка на человека по номеру телефона
  if (/^\d+$/.test(hash))
    return { kind: 'invalid', reason: 'Это ссылка на номер телефона, а не на канал' }
  if (!INVITE.test(hash))
    return { kind: 'invalid', reason: 'Ссылка-приглашение обрезана — скопируйте её целиком: t.me/+…' }
  return { kind: 'invite', hash }
}

/** Адрес канала для людей: t.me/<имя> или приглашение t.me/+<код>. */
export function channelUrl(c: { username: string | null, inviteHash: string | null }): string {
  return c.username ? `https://t.me/${c.username}` : `https://t.me/+${c.inviteHash}`
}

/** Тот же ли это канал: имя без учёта регистра, приглашение — точно. */
export function sameChannel(a: { username: string | null, inviteHash: string | null }, b: ChannelLink): boolean {
  if (b.kind === 'public')
    return a.username === b.username
  if (b.kind === 'invite')
    return a.inviteHash === b.hash
  return false
}
