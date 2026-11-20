import type { KaspiCandidate } from '~/utils/kaspiSnapshot'
import { KASPI_CARDS_LIMIT, normalizeKaspiUrl } from '~/utils/kaspiSnapshot'

/**
 * Сверить товар поставщика с выдачей Kaspi, которую принесла закладка:
 * артикул, название, при сомнении — фото моделью «Моделей ИИ». Сервер на
 * kaspi.kz не ходит; картинки выдачи по адресу скачивает провайдер ИИ.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ offerId?: unknown, item?: unknown, candidates?: unknown }>(event)
  if (!isUuid(body?.offerId))
    throw createError({ statusCode: 400, message: 'Не указан товар поставщика' })
  const item = Number(body.item)
  if (!Number.isInteger(item) || item < 0 || item > 100)
    throw createError({ statusCode: 400, message: 'Неверный номер товара в посте' })
  const raw = Array.isArray(body.candidates) ? body.candidates.slice(0, KASPI_CARDS_LIMIT) : []
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
  const candidates: KaspiCandidate[] = raw.flatMap((c: any) => {
    const url = normalizeKaspiUrl(c?.url)
    const title = typeof c?.title === 'string' ? c.title.trim().slice(0, 300) : ''
    if (!url || !title)
      return []
    const image = typeof c.image === 'string' && /^https:\/\/(?:[a-z0-9-]+\.)*(?:kaspi\.kz|cdn-kaspi\.kz)\/\S+$/i.test(c.image) ? c.image : null
    return [{ url, title, image, text: typeof c.text === 'string' ? c.text.slice(0, 400) : '', price: n(c.price), reviews: n(c.reviews), rating: n(c.rating), sellers: n(c.sellers) }]
  })
  if (!candidates.length)
    throw createError({ statusCode: 400, message: 'В выдаче нет товаров' })
  return matchKaspiOffer(db, body.offerId, item, candidates)
})
