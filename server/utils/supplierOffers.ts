import type { SupabaseClient } from '@supabase/supabase-js'
import type { SupplierPost } from '../../supabase/functions/_shared/supplierVisionCore'
import type { VisionReader } from './supplierVision'
import type { ChannelPost, ReadOptions } from './telegramAccount'
import type { Offer, OfferChannel, OfferReading, OfferStatus } from '~/utils/supplierOfferList'
import type { PreviewPost } from '~/utils/telegramPreview'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { isPreviewPage, parsePreviewPosts } from '~/utils/telegramPreview'
import { loadVisionReader, offerItemsReader, readFailure, visionModel } from './supplierVision'

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
 *
 * Название, артикул и цену с фото читает ИИ (5 ноября 2026,
 * server/utils/supplierVision.ts) — сразу при сборе, пока фото ещё в памяти:
 * лишнего трафика из хранилища нет. Не прочёлся — «Прочитать» на странице,
 * тогда фото берётся из бакета. Без миграции 20261105120000 и без ключа ИИ
 * товары собираются, как прежде, только без чтения.
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
/** ИИ читает по столько товаров сразу: лимиты провайдера на новом счёте невелики */
const READ_AT_ONCE = 2
/** «Прочитать» за один запрос — товаров не больше */
const REREAD_PER_CALL = 10
/** Новое чтение не начинаем позже этого от начала запроса: функция Vercel живёт до 300 с */
const READ_BUDGET_MS = 120_000

const OFFER_COLUMNS = 'id, channel_id, posted_at, caption, post_url, photo_url, photo_count, status, status_at'
/** Колонки чтения ИИ — миграция 20261105120000 */
const READ_COLUMNS = 'read_items, read_error'

interface OfferRow {
  id: string
  channel_id: string
  posted_at: string
  caption: string
  post_url: string
  photo_url: string | null
  photo_count: number
  status: string
  status_at: string | null
  read_items?: unknown
  read_error?: string | null
}

/** Миграции 20261104160000 (или 20261105120000 — чтения ИИ) ещё нет: таблицы, функции или колонки */
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
  const listOffers = (columns: string) => db.from('supplier_offers')
    .select(columns)
    .eq('status', status)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(LIST_LIMIT)
  const [channels, withRead, summary, secrets, readSummary, model, aiKeys] = await Promise.all([
    db.from('supplier_channels').select('id, title, invite_hash, collected_at, suppliers(name)').order('created_at'),
    listOffers(`${OFFER_COLUMNS}, ${READ_COLUMNS}`),
    db.rpc('supplier_offers_summary'),
    db.rpc('telegram_secrets_status'),
    db.rpc('supplier_offers_read_summary'),
    visionModel(db),
    db.rpc('ai_keys_status'),
  ])
  // Миграции чтения ИИ ещё нет — товары без прочитанного, как до 5.11
  const readInstalled = !supplierOffersNotInstalled(readSummary.error) && withRead.error?.code !== '42703'
  const offers = readInstalled ? withRead : await listOffers(OFFER_COLUMNS)
  if ([channels, offers, summary].some(r => supplierOffersNotInstalled(r.error)))
    return { installed: false as const }
  const failed = channels.error ?? offers.error ?? summary.error ?? (readInstalled ? readSummary.error : null)
  if (failed)
    throw dbError(failed)

  const counts = summary.data as { fresh: number, added: number, skipped: number }
  const rows = (channels.data ?? []) as unknown as { id: string, title: string, invite_hash: string | null, collected_at: string | null, suppliers: { name?: string } | null }[]
  const read = readSummary.data as { unread: number, failed: number } | null
  const items = readInstalled ? await offerItemsReader() : () => null
  // Ключи — только «задан или нет»: ни самих ключей, ни их последних знаков страница не видит
  const keyed = new Set(aiKeys.error ? [] : ((aiKeys.data ?? []) as { provider: string }[]).map(k => k.provider))
  const reading: OfferReading | null = readInstalled && read
    ? { model, key: keyed.has(model.slice(0, model.indexOf('/'))), unread: read.unread, failed: read.failed }
    : null
  return {
    installed: true as const,
    // Страж check-admin-supplier-offers.mjs не собирает, пока не увидит подделку Telegram и заглушки t.me и ИИ
    ...(process.env.TELEGRAM_FAKE === '1' ? { fake: true as const, web: telegramWebBase(), aiStub: aiStubBase() } : {}),
    reading,
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
    offers: ((offers.data ?? []) as unknown as OfferRow[]).map((o): Offer => ({
      id: o.id,
      channelId: o.channel_id,
      postedAt: o.posted_at,
      caption: o.caption,
      postUrl: o.post_url,
      photoUrl: o.photo_url,
      photoCount: o.photo_count,
      status: o.status as OfferStatus,
      statusAt: o.status_at,
      items: items(o.read_items),
      readError: o.read_error ?? null,
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

// ---------- чтение ИИ ----------

/** Что вышло из чтения за запрос */
export interface ReadOutcome {
  done: number
  /** Не прочлись — причина на карточке */
  failed: number
  /** Не дошла очередь: кончилось время запроса или провайдер отказал */
  left: number
  /** Почему не читали вовсе: нет миграции чтения, ключа ИИ или чтение не запустилось */
  off: 'migration' | 'key' | 'error' | null
}

/** Есть ли колонки чтения ИИ — миграция 20261105120000 */
async function readColumnsInstalled(db: SupabaseClient) {
  const { error } = await db.from('supplier_offers').select('read_at').limit(0)
  if (error && !supplierOffersNotInstalled(error))
    throw dbError(error)
  return !error
}

/**
 * Прочесть товары ИИ и записать прочитанное — по READ_AT_ONCE сразу. Новых
 * чтений не начинаем после `deadline`; провайдер отказал (ключ, лимит,
 * связь) — дальше не читаем: остаток прочтёт «Прочитать». `post: null` — фото
 * не нашлось.
 */
async function readOffers(db: SupabaseClient, jobs: { id: string, post: SupplierPost | null }[], deadline: number): Promise<ReadOutcome> {
  const outcome: ReadOutcome = { done: 0, failed: 0, left: jobs.length, off: null }
  if (!jobs.length)
    return outcome
  // Сбор к этому времени уже записан: сбой здесь — товары без чтения, а не ошибка сбора
  const failedToStart = (e: unknown) => {
    console.error('[supplier-offers] чтение ИИ не запустилось:', e instanceof Error ? e.message : e)
    return undefined
  }
  const installed = await readColumnsInstalled(db).catch(failedToStart)
  if (installed === undefined)
    return { ...outcome, off: 'error' }
  if (!installed)
    return { ...outcome, off: 'migration' }
  const loaded = await loadVisionReader(db).catch(failedToStart)
  if (loaded === undefined)
    return { ...outcome, off: 'error' }
  if (!loaded)
    return { ...outcome, off: 'key' }
  const reader: VisionReader = loaded

  const save = async (id: string, fields: Record<string, unknown>) => {
    const { error } = await db.from('supplier_offers')
      .update({ read_model: reader.model, read_at: new Date().toISOString(), ...fields })
      .eq('id', id)
    if (error)
      console.error('[supplier-offers] прочитанное не записалось', id, error.message)
    return !error
  }
  let next = 0
  let stopped = false
  await Promise.all(Array.from({ length: READ_AT_ONCE }, async () => {
    while (next < jobs.length && !stopped && Date.now() < deadline) {
      const job = jobs[next++]!
      if (!job.post) {
        await save(job.id, { read_items: null, read_error: 'Фото товара не нашлось в хранилище', read_input_tokens: null, read_output_tokens: null })
        outcome.failed++
        continue
      }
      try {
        const result = await reader.read(job.post)
        const saved = await save(job.id, { read_items: result.items, read_error: null, read_input_tokens: result.inputTokens, read_output_tokens: result.outputTokens })
        outcome[saved ? 'done' : 'failed']++
      }
      catch (e) {
        const failure = await readFailure(e)
        stopped ||= failure.stop
        await save(job.id, { read_items: null, read_error: failure.text, read_input_tokens: null, read_output_tokens: null })
        outcome.failed++
      }
    }
  }))
  outcome.left = jobs.length - next
  return outcome
}

/**
 * «Прочитать» — новые товары с фото, которые ИИ ещё не прочёл или не смог
 * прочесть; фото — из бакета, до REREAD_PER_CALL за запрос. `before` —
 * начало прохода: что пробовали после него, второй раз не берём, и проход
 * кончается, даже если товар не читается. `more` — есть ещё.
 */
export async function rereadSupplierOffers(db: SupabaseClient, before: string) {
  const started = Date.now()
  const since = new Date(started - OFFER_DAYS * DAY_MS).toISOString()
  const { data, error } = await db.from('supplier_offers')
    .select('id, caption, photo_path')
    .eq('status', 'new')
    .gte('posted_at', since)
    .not('photo_path', 'is', null)
    .is('read_items', null)
    // before — уже ISO-строка из маршрута, в фильтр сырой ввод не попадает
    .or(`read_at.is.null,read_at.lt."${before}"`)
    .order('posted_at', { ascending: false })
    .limit(REREAD_PER_CALL)
  if (error) {
    throw supplierOffersNotInstalled(error)
      ? createError({ statusCode: 409, message: 'Чтения ИИ ещё нет в базе: нужна миграция 20261105120000_supplier_offers_read' })
      : createError({ statusCode: 500, message: error.message })
  }
  if (!data.length)
    return { done: 0, failed: 0, left: 0, more: false }

  const bucket = db.storage.from(BUCKET)
  const jobs = await Promise.all(data.map(async (r) => {
    const { data: blob, error: downloadError } = await bucket.download(r.photo_path!)
    if (downloadError || !blob) {
      console.error('[supplier-offers] фото из бакета', r.photo_path, downloadError?.message)
      return { id: r.id, post: null }
    }
    const ext = r.photo_path!.split('.').pop()!
    const mediaType = EXT[blob.type] ? blob.type : Object.keys(EXT).find(t => EXT[t] === ext) ?? 'image/jpeg'
    return { id: r.id, post: { images: [{ mediaType, data: Buffer.from(await blob.arrayBuffer()).toString('base64') }], caption: r.caption } }
  }))
  const outcome = await readOffers(db, jobs, started + READ_BUDGET_MS)
  if (outcome.off === 'key')
    throw createError({ statusCode: 409, message: 'Ключа ИИ нет — задайте его на странице «Модели ИИ»' })
  if (outcome.off === 'error')
    throw createError({ statusCode: 500, message: 'Чтение ИИ не запустилось — подробности в журнале сервера' })
  const { done, failed, left } = outcome
  return { done, failed, left, more: data.length === REREAD_PER_CALL && !left }
}

// ---------- сбор ----------

/** Новые товары одного канала: до PER_COLLECT за раз, `more` — есть ещё */
export async function collectSupplierOffers(db: SupabaseClient, channelId: string) {
  const started = Date.now()
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
  let fresh: { id: string, message_id: number }[] = []
  if (rows.length) {
    // Уже собранные (два сбора подряд) остаются со своим статусом — и со своим прочитанным
    const { data, error: insertError } = await db.from('supplier_offers')
      .upsert(rows, { onConflict: 'channel_id,message_id', ignoreDuplicates: true })
      .select('id, message_id')
    if (insertError)
      throw dbError(insertError)
    fresh = data
  }
  const collectedAt = new Date().toISOString()
  const { error: updateError } = await db.from('supplier_channels')
    .update({ collected_up_to: read.upTo ?? channel.collected_up_to, collected_at: collectedAt })
    .eq('id', channel.id)
  if (updateError)
    throw dbError(updateError)

  // Чтение ИИ — после записи сбора: сбой или долгий ответ модели собранного не отнимет
  const byMessage = new Map(posts.map(p => [p.id, p]))
  const ai = await readOffers(db, fresh.flatMap((r) => {
    const p = byMessage.get(r.message_id)
    return p?.photo
      ? [{ id: r.id, post: { images: [{ mediaType: p.photo.type, data: Buffer.from(p.photo.bytes).toString('base64') }], caption: p.caption } }]
      : []
  }), started + READ_BUDGET_MS)
  return { added: fresh.length, more: read.more, collectedAt, read: ai }
}
