/**
 * Сообщения канала поставщика → товары (4 ноября 2026). Товар — фото со
 * своей подписью. В «Оптом Игрушки Алматы» альбом — пачка разных товаров, у
 * каждого фото своя подпись-артикул, поэтому альбом делится по подписям; фото
 * без подписи (или с той же) — ещё снимок того же товара. Правилом пользуются
 * сборщик «Товаров поставщиков» (server/utils/supplierOffers.ts) и стенд
 * выбора модели (scripts/supplier-vision/fetch-closed-channel.ts).
 */

export interface ChannelMessage<T> {
  id: number
  /** Общий для сообщений одного альбома; у одиночного — null */
  album: string | null
  text: string
  /** Картинка сообщения; сообщения без неё товара не дают */
  image: T | null
}

export interface ChannelProduct<T> {
  /** Первое сообщение товара */
  id: number
  /** Последнее — товар из альбома может тянуться на несколько сообщений */
  lastId: number
  album: string | null
  images: T[]
  caption: string
}

/** Сообщения от старых к новым → товары по тому же порядку */
export function groupProducts<T>(messages: ChannelMessage<T>[]): ChannelProduct<T>[] {
  const products: ChannelProduct<T>[] = []
  for (const m of messages) {
    if (!m.image)
      continue
    const text = m.text.trim()
    const last = products.at(-1)
    if (last && m.album && m.album === last.album && (!text || !last.caption || text === last.caption)) {
      last.images.push(m.image)
      last.lastId = m.id
      last.caption ||= text
    }
    else {
      products.push({ id: m.id, lastId: m.id, album: m.album, images: [m.image], caption: text })
    }
  }
  return products
}
