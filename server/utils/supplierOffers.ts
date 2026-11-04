import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelPost, ReadOptions } from './telegramAccount'
import type { Offer, OfferChannel, OfferStatus } from '~/utils/supplierOfferList'
import type { PreviewPost } from '~/utils/telegramPreview'
import process from 'node:process'
import { isPreviewPage, parsePreviewPosts } from '~/utils/telegramPreview'

/**
 * «Товары поставщиков» (4 ноября 2026) — список ссылок умного закупа на
 * /admin/supplier-offers. Товар — фото поста со своей подписью
 * (utils/supplierPosts.ts). Кнопка «Собрать» берёт новые посты канала после
 * прочитанного: открытого — со страницы t.me/s/<имя>, без аккаунта;
 * закрытого — аккаунтом со страницы «Аккаунт Telegram».
 *
 * Фото с t.me живут меньше суток, поэтому первое фото товара ложится в
 * закрытый бакет supplier-photos, а в строку — ссылка на него, подписанная на
 * OFFER_DAYS. Столько товар и держится: старше сборщик удаляет вместе с фото.
 * Фото — около 800 px: на снимках поставщиков артикул и цена, их должно быть
 * видно. Размер — около 100 КБ, у @amr_toys 10–58 постов в день (29.10–4.11):
 * за 30 дней ~80 МБ из 1 ГБ хранилища.
 *
 * Один запрос — один канал и до PER_COLLECT товаров: функция Vercel не висит,
 * а страница продолжает, пока сборщик отвечает `more`.
 */

const BUCKET = 'supplier-photos'
/** Столько дней товар держится в списке */
const OFFER_DAYS = 30
/** Первый сбор канала — посты за столько дней */
const FIRST_DAYS = 3
/** Товаров канала за один запрос */
const PER_COLLECT = 30
/** Страниц t.me/s за один запрос, не больше */
const MAX_PAGES = 15
/** Столько товаров отдаёт страница списка; остальные — после разбора этих */
const LIST_LIMIT = 300
/** Бакет больше не примет */
const PHOTO_MAX_BYTES = 2 * 1024 * 1024
const DAY_MS = 86_400_000
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** Миграции 20261104160000 ещё нет: таблицы, функции или колонки сборщика */
export function supplierOffersNotInstalled(error: { code?: string } | null | undefined): boolean {
  return ['PGRST202', 'PGRST204', 'PGRST205', '42883', '42P01', '42703'].includes(error?.code ?? '')
}

function dbError(error: { code?: string, message: string }) {
  return supplierOffersNotInstalled(error)
    ? createError({ statusCode: 409, message: 'Товаров поставщиков ещё нет в базе: нужна миграция 20261104160000_supplier_offers' })
    : createError({ statusCode: 500, message: error.message })
}

// ---------- список ----------

/** Что видит страница: товары одного статуса за OFFER_DAYS, каналы и счётчики */
export async function supplierOffersPage(db: SupabaseClient, status: OfferStatus) {
  const since = new Date(Date.now() - OFFER_DAYS * DAY_MS).toISOString()
  const [channels, offers, summary, secrets] = await Promise.all([
    db.from('supplier_channels').select('id, title, invite_hash, collected_at, suppliers(name)').order('created_at'),
    db.from('supplier_offers')
      .select('id, channel_id, posted_at, caption, post_url, photo_url, photo_count, status, status_at')
      .eq('status', status)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(LIST_LIMIT),
    db.rpc('supplier_offers_summary'),
    db.rpc('telegram_secrets_status'),
  ])
  if ([channels, offers, summary].some(r => supplierOffersNotInstalled(r.error)))
    return { installed: false as const }
  const failed = channels.error ?? offers.error ?? summary.error
  if (failed)
    throw dbError(failed)

  const counts = summary.data as { fresh: number, added: number, skipped: number }
  const rows = (channels.data ?? []) as unknown as { id: string, title: string, invite_hash: string | null, collected_at: string | null, suppliers: { name?: string } | null }[]
  return {
    installed: true as const,
    // Страж check-admin-supplier-offers.mjs не собирает, пока не увидит подделку Telegram и заглушку t.me
    ...(process.env.TELEGRAM_FAKE === '1' ? { fake: true as const, web: telegramWebBase() } : {}),
    // Закрытые каналы без аккаунта не собрать; миграции аккаунта нет — тоже нет
    account: !secrets.error && ((secrets.data ?? []) as { name: string }[]).some(r => r.name === 'session'),
    counts: { new: counts.fresh, added: counts.added, skipped: counts.skipped },
    limit: LIST_LIMIT,
    channels: rows.map((c): OfferChannel => ({
      id: c.id,
      title: c.title,
      supplierName: c.suppliers?.name ?? '',
      closed: !!c.invite_hash,
      collectedAt: c.collected_at,
    })),
    offers: (offers.data ?? []).map((o): Offer => ({
      id: o.id,
      channelId: o.channel_id,
      postedAt: o.posted_at,
      caption: o.caption,
      postUrl: o.post_url,
      photoUrl: o.photo_url,
      photoCount: o.photo_count,
      status: o.status as OfferStatus,
      statusAt: o.status_at,
    })),
  }
}

/** «Добавил на сайт», «Не брать», «Вернуть» */
export async function setSupplierOffersStatus(db: SupabaseClient, adminId: string, ids: string[], status: OfferStatus) {
  const marked = status !== 'new'
  const { data, error } = await db.from('supplier_offers')
    .update({ status, status_at: marked ? new Date().toISOString() : null, status_by: marked ? adminId : null })
    .in('id', ids)
    .select('id')
  if (error)
    throw dbError(error)
  return { updated: data.length }
}

// ---------- сбор ----------

/** Товар канала — у открытого и у закрытого одинаково */
interface Collected {
  posts: (Omit<ChannelPost, 'lastId'> & { url: string })[]
  upTo: number | null
  more: boolean
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Фото с CDN Telegram (или заглушки стража); null — не скачалось */
async function downloadPhoto(url: string): Promise<ChannelPost['photo']> {
  const stub = telegramWebBase()
  const allowed = stub === 'https://t.me'
    ? /^https:\/\/[\w.-]+\.(?:telesco\.pe|telegram\.org|cdn-telegram\.org)\//.test(url)
    : url.startsWith(`${stub}/`)
  if (!allowed)
    return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!res.ok || !EXT[type]) {
      await res.body?.cancel()
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.length && bytes.length <= PHOTO_MAX_BYTES ? { bytes, type } : null
  }
  catch {
    return null
  }
}

async function previewPage(username: string, query: string) {
  const page = await getTelegramPage(`s/${username}${query}`)
  if (page.status !== 200 || !isPreviewPage(page.html))
    throw createError({ statusCode: 409, message: 'Посты канала больше не видны без аккаунта — проверьте канал на странице «Поставщики»' })
  // Подряд t.me отвечает 429
  await delay(400)
  return parsePreviewPosts(page.html)
}

/** Открытый канал — t.me/s/<имя>, по 20 сообщений на странице */
async function readOpenChannel(username: string, { afterId, since, limit }: ReadOptions): Promise<Collected> {
  let taken: PreviewPost[] = []
  let newestId = afterId
  let more = false
  if (afterId) {
    // После прочитанного вперёд: ?after= отдаёт следующие от старых к новым
    let after = afterId
    let page = 0
    for (; page < MAX_PAGES && !more; page++) {
      const { posts, lastId } = await previewPage(username, `?after=${after}`)
      if (!lastId || lastId <= after)
        break
      for (const post of posts.filter(p => p.id > after).sort((a, b) => a.id - b.id)) {
        if (taken.length === limit) {
          more = true
          break
        }
        taken.push(post)
      }
      newestId = lastId
      after = lastId
    }
    more ||= page === MAX_PAGES
  }
  else {
    // Первый сбор: с последней страницы назад, пока посты не старше since
    const seen: PreviewPost[] = []
    let before: number | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const { posts, firstId, lastId } = await previewPage(username, before ? `?before=${before}` : '')
      if (page === 0)
        newestId = lastId
      seen.push(...posts)
      if (!firstId || posts.some(p => p.date && Date.parse(p.date) < since.getTime()))
        break
      before = firstId
    }
    const fresh = seen.filter(p => p.date && Date.parse(p.date) >= since.getTime()).sort((a, b) => a.id - b.id)
    taken = fresh.slice(0, limit)
    more = fresh.length > limit
  }

  const posts: Collected['posts'] = []
  for (const p of taken) {
    posts.push({
      id: p.id,
      date: p.date ?? new Date().toISOString(),
      caption: p.caption,
      photoCount: p.photos.length,
      photo: await downloadPhoto(p.photos[0]!),
      url: `https://t.me/${username}/${p.id}`,
    })
  }
  return { posts, upTo: more && taken.length ? taken.at(-1)!.id : newestId, more }
}

async function readClosed(db: SupabaseClient, hash: string, options: ReadOptions): Promise<Collected> {
  const read = await readClosedChannel(db, hash, options)
  return {
    posts: read.posts.map(({ lastId: _, ...p }) => ({ ...p, url: `https://t.me/c/${read.chatId}/${p.id}` })),
    upTo: read.upTo,
    more: read.more,
  }
}

/** Первые фото в бакет, ссылки на них — подписанные на OFFER_DAYS */
async function savePhotos(db: SupabaseClient, channelId: string, posts: Collected['posts']) {
  const bucket = db.storage.from(BUCKET)
  const paths = new Map<number, string>()
  const withPhoto = posts.filter(p => p.photo)
  // По 4 сразу: 30 фото по одному — секунды ожидания
  for (let i = 0; i < withPhoto.length; i += 4) {
    await Promise.all(withPhoto.slice(i, i + 4).map(async (p) => {
      const path = `${channelId}/${p.id}.${EXT[p.photo!.type]}`
      // Браузеру срок кеша задаёт подпись ссылки — Expires на её конец; cacheControl —
      // для остальных путей хранилища
      const { error } = await bucket.upload(path, p.photo!.bytes, {
        contentType: p.photo!.type,
        cacheControl: String(OFFER_DAYS * 86_400),
        upsert: true,
      })
      if (error)
        console.error('[supplier-offers] фото', path, error.message)
      else
        paths.set(p.id, path)
    }))
  }
  const urls = new Map<number, { path: string, url: string }>()
  if (!paths.size)
    return urls
  const { data, error } = await bucket.createSignedUrls([...paths.values()], OFFER_DAYS * 86_400)
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  const signed = new Map(data.flatMap(d => d.path && d.signedUrl ? [[d.path, d.signedUrl]] : []))
  for (const [id, path] of paths) {
    const url = signed.get(path)
    if (url)
      urls.set(id, { path, url })
  }
  return urls
}

/**
 * Старше OFFER_DAYS — из списка и из бакета. Фото каналов, которых больше
 * нет, — тоже: строки уходят с каналом каскадом, а файлы бакета сами нет.
 */
async function dropExpired(db: SupabaseClient) {
  const bucket = db.storage.from(BUCKET)
  const cutoff = new Date(Date.now() - OFFER_DAYS * DAY_MS).toISOString()
  const { data: old, error } = await db.from('supplier_offers').select('id, photo_path').lt('posted_at', cutoff).limit(500)
  if (error)
    throw dbError(error)
  if (old.length) {
    const paths = old.flatMap(r => r.photo_path ? [r.photo_path] : [])
    const removed = paths.length ? await bucket.remove(paths) : { error: null }
    if (removed.error)
      console.error('[supplier-offers] удаление фото', removed.error.message)
    else
      await db.from('supplier_offers').delete().in('id', old.map(r => r.id))
  }

  const [{ data: folders }, { data: channels }] = await Promise.all([
    bucket.list('', { limit: 1000 }),
    db.from('supplier_channels').select('id'),
  ])
  const known = new Set((channels ?? []).map(c => c.id))
  for (const folder of folders ?? []) {
    if (folder.id !== null || known.has(folder.name))
      continue
    const { data: files } = await bucket.list(folder.name, { limit: 1000 })
    if (files?.length)
      await bucket.remove(files.map(f => `${folder.name}/${f.name}`))
  }
}

/** Новые товары одного канала: до PER_COLLECT за раз, `more` — есть ещё */
export async function collectSupplierOffers(db: SupabaseClient, channelId: string) {
  const { data: channel, error } = await db.from('supplier_channels')
    .select('id, username, invite_hash, collected_up_to, collected_at')
    .eq('id', channelId)
    .maybeSingle()
  if (error)
    throw dbError(error)
  if (!channel)
    throw createError({ statusCode: 404, message: 'Канал не найден' })

  await dropExpired(db)
  const now = Date.now()
  const cutoff = now - OFFER_DAYS * DAY_MS
  // Не собирали дольше OFFER_DAYS — всё после прочитанного уже старое: заново, как первый раз
  const options: ReadOptions = {
    afterId: channel.collected_at && Date.parse(channel.collected_at) > cutoff ? channel.collected_up_to : null,
    since: new Date(now - FIRST_DAYS * DAY_MS),
    limit: PER_COLLECT,
  }
  const read = channel.invite_hash
    ? await readClosed(db, channel.invite_hash, options)
    : await readOpenChannel(channel.username!, options)

  const posts = read.posts.filter(p => Date.parse(p.date) >= cutoff)
  const photos = await savePhotos(db, channel.id, posts)
  const rows = posts.map(p => ({
    channel_id: channel.id,
    message_id: p.id,
    posted_at: p.date,
    caption: p.caption.slice(0, 4096),
    post_url: p.url,
    photo_path: photos.get(p.id)?.path ?? null,
    photo_url: photos.get(p.id)?.url ?? null,
    photo_count: p.photoCount,
  }))
  let added = 0
  if (rows.length) {
    // Уже собранные (два сбора подряд) остаются со своим статусом
    const { data, error: insertError } = await db.from('supplier_offers')
      .upsert(rows, { onConflict: 'channel_id,message_id', ignoreDuplicates: true })
      .select('id')
    if (insertError)
      throw dbError(insertError)
    added = data.length
  }
  const collectedAt = new Date().toISOString()
  const { error: updateError } = await db.from('supplier_channels')
    .update({ collected_up_to: read.upTo ?? channel.collected_up_to, collected_at: collectedAt })
    .eq('id', channel.id)
  if (updateError)
    throw dbError(updateError)
  return { added, more: read.more, collectedAt }
}
