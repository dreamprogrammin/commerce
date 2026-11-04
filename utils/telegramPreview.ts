/**
 * Страница просмотра открытого канала `t.me/s/<канал>` — без аккаунта (3
 * ноября 2026): по 20 постов, от старых к новым; раньше — `?before=<номер>`,
 * позже — `?after=<номер>`. Разбор общий у сборщика «Товаров поставщиков»
 * (server/utils/supplierOffers.ts), проверки канала (server/utils/telegramWeb.ts)
 * и стенда выбора модели (scripts/supplier-vision/fetch-channel.ts).
 *
 * Адреса фото на CDN Telegram живут меньше суток: снятые 3.11 в 14:18 к утру
 * 4.11 отвечали 404. Ссылаться на них из списка нельзя — только скачивать.
 */

export interface PreviewPost {
  id: number
  /** Время поста, ISO; на странице оно у каждого поста */
  date: string | null
  /** Адреса фото на CDN Telegram */
  photos: string[]
  caption: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** Текст поста: переносы строк сохраняются */
export function postText(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')).trim()
}

/** Есть ли у канала просмотр без аккаунта: у закрытого, группы, человека и бота его нет */
export function isPreviewPage(html: string): boolean {
  return html.includes('class="tgme_channel_info"')
}

/**
 * Посты с фото; видео и текст без фото пропускаются. firstId и lastId —
 * самое старое и самое новое сообщение страницы, с фото или без: для
 * `?before=` и `?after=`.
 */
export function parsePreviewPosts(html: string): { posts: PreviewPost[], firstId: number | null, lastId: number | null } {
  const posts: PreviewPost[] = []
  let firstId: number | null = null
  let lastId: number | null = null
  for (const part of html.split('<div class="tgme_widget_message_wrap').slice(1)) {
    const id = Number(part.match(/data-post="[^/"]+\/(\d+)"/)?.[1])
    if (!id)
      continue
    firstId = firstId === null ? id : Math.min(firstId, id)
    lastId = lastId === null ? id : Math.max(lastId, id)
    const photos = [...part.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)].map(m => m[1]!)
    const caption = postText(part.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '')
    const date = part.match(/<time datetime="([^"]+)"/)?.[1] ?? null
    if (photos.length)
      posts.push({ id, date, photos, caption })
  }
  return { posts, firstId, lastId }
}
