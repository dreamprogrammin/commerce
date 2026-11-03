import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelCheck, ChannelLink } from '~/utils/telegramChannel'
import { parseChannelLink } from '~/utils/telegramChannel'

/**
 * Проверка канала поставщика у Telegram (3 ноября 2026) — для поля «Каналы в
 * Telegram» в карточке поставщика. Читаются открытые страницы t.me, без
 * аккаунта и ключей:
 *   - t.me/<имя> и t.me/+<код> — название, подписчики, канал это или группа;
 *     человек и бот здесь тоже открываются, их не берём;
 *   - t.me/s/<имя> — просмотр канала без аккаунта: есть ли он и когда был
 *     последний пост. Отсюда же потом будут читаться посты.
 *
 * Разметка t.me — не API. Если Telegram её поменяет, проверка ответит «канал
 * не найден», а не запишет в базу мусор.
 */
const WEB = 'https://t.me'
const UA = 'Mozilla/5.0 (compatible; uhti.kz supplier channels; +https://uhti.kz)'

/** Колонки supplier_channels, которые видит страница. */
export const SUPPLIER_CHANNEL_COLUMNS = 'id, supplier_id, username, invite_hash, title, chat_type, web_preview, checked_at, created_at'

type ChannelRef = Exclude<ChannelLink, { kind: 'invalid' }>

export interface TgPage {
  title: string | null
  /** other — человек или бот */
  type: 'channel' | 'group' | 'other'
  members: number | null
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Текст фрагмента разметки: без тегов, галочки «проверен» и лишних пробелов. */
function text(fragment: string): string {
  return decodeEntities(fragment.replace(/<i class="verified-icon">[\s\S]*?<\/i>/g, '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Страница t.me/<имя> или t.me/+<код>. Названия нет — имени или приглашения
 * нет (у несуществующего имени t.me показывает «Send Message» без названия, у
 * устаревшего приглашения — общее «Join Group»).
 */
export function parseTgPage(html: string): TgPage {
  const titleHtml = html.match(/<div class="tgme_page_title"[^>]*>([\s\S]*?)<\/div>/)?.[1]
  const title = titleHtml ? text(titleHtml) || null : null
  const extras = [...html.matchAll(/<div class="tgme_page_extra"[^>]*>([\s\S]*?)<\/div>/g)].map(m => text(m[1] ?? ''))
  let type: TgPage['type'] = 'other'
  let members: number | null = null
  for (const extra of extras) {
    // «1 804 456 subscribers», «16 779 members, 3 553 online»
    const [, count, word] = extra.match(/^(\d+(?:[\s,.]\d+)*)\s*(subscriber|member|подписчик|участник)/i) ?? []
    if (!count || !word)
      continue
    members = Number(count.replace(/\D/g, ''))
    type = /subscriber|подписчик/i.test(word) ? 'channel' : 'group'
    break
  }
  // Счётчика нет, но t.me предлагает просмотр канала или «Join Channel»
  if (type === 'other' && (/class="tgme_page_context_link"[^>]*href="\/s\//.test(html) || />\s*Join Channel\s*</.test(html)))
    type = 'channel'
  return { title, type, members }
}

/**
 * Просмотр канала t.me/s/<имя>: посты на странице (до 20 последних) и время
 * самого свежего. null — это не страница канала.
 */
export function parsePreviewPage(html: string): { posts: number, lastPostAt: string | null } | null {
  if (!html.includes('class="tgme_channel_info"'))
    return null
  const posts = html.match(/class="tgme_widget_message [^"]*"[^>]*data-post="/g)?.length ?? 0
  const times = [...html.matchAll(/class="tgme_widget_message_date"[^>]*>\s*<time datetime="([^"]+)"/g)]
    .map(m => Date.parse(m[1] ?? ''))
    .filter(Number.isFinite)
  return { posts, lastPostAt: times.length ? new Date(Math.max(...times)).toISOString() : null }
}

async function getPage(path: string): Promise<{ status: number, html: string }> {
  let res: Response
  try {
    // redirect: 'manual' — t.me/s/ на не-канал отвечает 302, это ответ, а не сбой
    res = await fetch(`${WEB}/${path}`, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10000),
    })
  }
  catch {
    throw createError({ statusCode: 502, message: 'Telegram не ответил — попробуйте ещё раз' })
  }
  if (res.status === 429 || res.status >= 500)
    throw createError({ statusCode: 502, message: `Telegram ответил ошибкой ${res.status} — попробуйте позже` })
  if (res.status !== 200) {
    await res.body?.cancel()
    return { status: res.status, html: '' }
  }
  return { status: 200, html: await res.text() }
}

/** Канал по ссылке — у самого Telegram. Не канал и не группа — 400 с причиной. */
export async function checkTelegramChannel(link: ChannelRef): Promise<Omit<ChannelCheck, 'existing'>> {
  const page = await getPage(link.kind === 'invite' ? `+${link.hash}` : link.username)
  const info = page.status === 200 ? parseTgPage(page.html) : null
  if (!info?.title) {
    throw createError({
      statusCode: 400,
      message: link.kind === 'invite'
        ? 'Приглашение не открывается: оно устарело или его отозвали — попросите у поставщика новое'
        : `В Telegram нет канала @${link.username} — проверьте имя`,
    })
  }
  if (info.type === 'other') {
    throw createError({
      statusCode: 400,
      message: `${link.kind === 'public' ? `@${link.username}` : 'Это приглашение'} — не канал, а личный аккаунт или бот`,
    })
  }

  let webPreview = false
  let lastPostAt: string | null = null
  if (link.kind === 'public' && info.type === 'channel') {
    const preview = await getPage(`s/${link.username}`)
    const posts = preview.status === 200 ? parsePreviewPage(preview.html) : null
    webPreview = posts !== null
    lastPostAt = posts?.lastPostAt ?? null
  }
  return {
    username: link.kind === 'public' ? link.username : null,
    inviteHash: link.kind === 'invite' ? link.hash : null,
    title: info.title.slice(0, 200),
    type: info.type,
    webPreview,
    members: info.members,
    lastPostAt,
  }
}

/** Ссылка из тела запроса → канал; не канал — 400 с причиной для человека. */
export function readChannelLink(body: unknown): ChannelRef {
  const raw = (body as { link?: unknown } | null)?.link
  if (typeof raw !== 'string' || raw.length > 300)
    throw createError({ statusCode: 400, message: 'Нужна ссылка на канал: t.me/имя, @имя или t.me/+приглашение' })
  const link = parseChannelLink(raw)
  if (link.kind === 'invalid')
    throw createError({ statusCode: 400, message: link.reason })
  return link
}

/*
 * Миграции каналов (20261103120000_supplier_channels) ещё нет: превью с `dev`
 * смотрит в боевую базу до её применения. PostgREST отвечает PGRST205,
 * Postgres — 42P01.
 */
export function channelsNotInstalled(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

/** За каким поставщиком канал уже записан; null — ни за каким (или миграции ещё нет). */
export async function channelOwner(db: SupabaseClient, c: { username: string | null, inviteHash: string | null }) {
  const query = db.from('supplier_channels').select('supplier_id, suppliers(name)').limit(1)
  const { data, error } = await (c.username ? query.eq('username', c.username) : query.eq('invite_hash', c.inviteHash)).maybeSingle()
  if (error && !channelsNotInstalled(error))
    throw createError({ statusCode: 500, message: error.message })
  if (!data)
    return null
  const supplier = data.suppliers as { name?: string } | null
  return { supplierId: data.supplier_id as string, supplierName: supplier?.name ?? '' }
}
