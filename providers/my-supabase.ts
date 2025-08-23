import type { ProviderGetImage } from '@nuxt/image'
// ~/providers/my-supabase.ts
import { joinURL } from 'ufo'

export const getImage: ProviderGetImage = (src, { modifiers, baseURL }) => {
  // src будет "название-бакета/путь/к/файлу.jpg"

  const parts = src.split('/')
  if (parts.length < 2) {
    console.error('Invalid src for Supabase provider. Must be in "bucket/path/to/image.jpg" format.', src)
    return { url: '' }
  }

  const bucket = parts.shift()! // Забираем бакет
  const imagePath = parts.join('/') // Собираем путь

  // [ИСПРАВЛЕНИЕ]: Используем URLSearchParams для безопасного создания URL
  // Это стандартный и надежный способ работы с параметрами запроса.
  const params = new URLSearchParams({
    url: imagePath,
    bucket,
    // Безопасно получаем качество, с fallback-значением 75
    quality: (modifiers?.quality || 75).toString(),
  })

  // Добавляем ширину, только если она была передана
  if (modifiers?.width) {
    params.append('width', modifiers.width.toString())
  }

  // Добавляем высоту, только если она была передана
  if (modifiers?.height) {
    params.append('height', modifiers.height.toString())
  }

  // Собираем финальный URL. params.toString() вернет строку "url=...&bucket=...&width=..."
  const url = joinURL(baseURL!, `?${params.toString()}`)

  return { url }
}
