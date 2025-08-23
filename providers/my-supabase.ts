import type { ProviderGetImage } from '@nuxt/image'
// ~/providers/my-supabase.ts
import { joinURL } from 'ufo'

export const getImage: ProviderGetImage = (src, { modifiers, baseURL }) => {
  // [ИСПРАВЛЕНИЕ]: Очищаем src от лишних слэшей по краям
  const cleanSrc = src.startsWith('/') ? src.substring(1) : src

  const parts = cleanSrc.split('/')
  if (parts.length < 2 || !parts[0]) {
    console.error('Invalid src for Supabase provider. Must be in "bucket/path/to/image.jpg" format and bucket cannot be empty.', src)
    return { url: '' }
  }

  const bucket = parts.shift()!
  const imagePath = parts.join('/')

  const params = new URLSearchParams({
    url: imagePath,
    bucket,
    quality: (modifiers?.quality || 75).toString(),
  })

  if (modifiers?.width) {
    params.append('width', modifiers.width.toString())
  }

  if (modifiers?.height) {
    params.append('height', modifiers.height.toString())
  }

  const url = joinURL(baseURL!, `?${params.toString()}`)

  return { url }
}
