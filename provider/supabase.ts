import type { ProviderGetImage } from '@nuxt/image'
import { joinURL } from 'ufo'

export const getImage: ProviderGetImage = (src, { modifiers = {}, baseURL } = {}) => {
  const { width, height, quality = 80, format } = modifiers

  // Формируем параметры для Supabase Image Transformation
  const params: string[] = []

  if (width)
    params.push(`width=${width}`)
  if (height)
    params.push(`height=${height}`)
  if (quality)
    params.push(`quality=${quality}`)
  if (format)
    params.push(`format=${format}`)

  const queryString = params.length > 0 ? `?${params.join('&')}` : ''

  return {
    url: joinURL(baseURL || '', src) + queryString,
  }
}
