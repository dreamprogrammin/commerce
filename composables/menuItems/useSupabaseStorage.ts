import type { Database, IUploadFileOptions } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'
import { IMAGE_OPTIMIZATION_ENABLED } from '@/config/images'

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'avif' | 'jpeg' | 'png'
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * 🖼️ Composable для работы с Supabase Storage
 *
 * КЛЮЧЕВЫЕ ОПТИМИЗАЦИИ:
 * ✅ Кеширование URLs БЕЗ timestamp (стабильные URL)
 * ✅ Timestamp добавляется ОДИН РАЗ при создании URL
 * ✅ Браузер может кешировать изображения нормально
 */
export function useSupabaseStorage() {
  const supabase = useSupabaseClient<Database>()
  const config = useRuntimeConfig()

  const isLoading = ref(false)
  const uploadError = ref<string | null>(null)

  // 🗄️ КЕШИРОВАНИЕ: Map<cacheKey, stableUrl>
  // ВАЖНО: URL кешируется ОДИН РАЗ с timestamp и больше не меняется
  const imageUrlCache = new Map<string, string>()

  async function uploadFile(
    file: File,
    options: IUploadFileOptions,
  ): Promise<string | null> {
    isLoading.value = true
    uploadError.value = null

    if (!file) {
      const noFileError = 'Файл не загружен'
      uploadError.value = noFileError
      toast.error('Ошибка загрузки', { description: noFileError })
      isLoading.value = false
      return null
    }

    const fileExt = file.name.split('.').pop()
    const uniqueFileName = `${uuidv4()}${fileExt ? `.${fileExt}` : ''}`
    const filePath = options.filePathPrefix
      ? `${options.filePathPrefix.replace(/\/$/, '')}/${uniqueFileName}`
      : uniqueFileName

    try {
      console.log(`📤 Загружаем: ${uniqueFileName} → ${options.bucketName}/${filePath}`)

      const { data, error } = await supabase.storage
        .from(options.bucketName)
        .upload(filePath, file, {
          cacheControl: options.cashControl || '3600',
          upsert: options.upsert === undefined ? true : options.upsert,
          contentType: options.contentType,
        })

      if (error)
        throw error

      console.log(`✅ Файл загружен: ${data.path}`)
      toast.success('Файл загружен', { description: `${file.name} успешно загружен` })

      return data.path
    }
    catch (e: any) {
      const message = e.message || `Ошибка загрузки в ${options.bucketName}`
      uploadError.value = message
      toast.error('Ошибка Storage', { description: message })
      console.error(`❌ Ошибка загрузки в "${options.bucketName}":`, e)
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  async function removeFile(
    bucketName: string,
    filePaths: string | string[],
  ): Promise<boolean> {
    const pathsToRemove = Array.isArray(filePaths) ? filePaths : [filePaths]
    const validPaths = pathsToRemove.filter(p => p && p.trim() !== '')

    if (validPaths.length === 0)
      return true

    try {
      console.log(`🗑️ Удаляем из ${bucketName}: ${validPaths.join(', ')}`)

      const { error } = await supabase.storage.from(bucketName).remove(validPaths)
      if (error)
        throw error

      toast.success('Файлы удалены', {
        description: `${validPaths.length} файл(ов) удалено`,
      })

      // Очищаем кеш
      validPaths.forEach((path) => {
        const keysToDelete: string[] = []
        imageUrlCache.forEach((_, key) => {
          if (key.includes(path))
            keysToDelete.push(key)
        })
        keysToDelete.forEach(key => imageUrlCache.delete(key))
      })

      console.log(`✅ Файлы удалены`)
      return true
    }
    catch (e: any) {
      const message = e.message || `Ошибка удаления из ${bucketName}`
      toast.error('Ошибка Storage', { description: message })
      console.error(`❌ Ошибка удаления из "${bucketName}":`, e)
      return false
    }
  }

  function getPublicUrl(
    bucketName: string,
    filePath: string | null,
  ): string | null {
    if (!filePath?.trim())
      return null

    try {
      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)
      return data?.publicUrl || null
    }
    catch (e) {
      console.error(`❌ Ошибка получения public URL "${filePath}":`, e)
      return null
    }
  }

  function getOptimizedUrl(
    bucketName: string,
    filePath: string | null,
    options: ImageTransformOptions = {},
  ): string | null {
    if (!filePath?.trim())
      return null

    try {
      const {
        width,
        height,
        quality = 80,
        format = 'webp',
        resize = 'cover',
      } = options

      const params: string[] = []
      if (width)
        params.push(`width=${width}`)
      if (height)
        params.push(`height=${height}`)
      if (quality)
        params.push(`quality=${quality}`)
      if (format)
        params.push(`format=${format}`)
      if (resize)
        params.push(`resize=${resize}`)

      const queryString = params.length > 0 ? `?${params.join('&')}` : ''
      const baseUrl = `${config.public.supabase.url}/storage/v1/render/image/public/${bucketName}`
      const url = `${baseUrl}/${filePath}${queryString}`

      console.log(`🚀 Optimized URL (${format} ${width}x${height})`)
      return url
    }
    catch (e) {
      console.error(`❌ Ошибка получения optimized URL "${filePath}":`, e)
      return getPublicUrl(bucketName, filePath)
    }
  }

  /**
   * 🎯 ГЛАВНАЯ ФУНКЦИЯ: Получить URL изображения
   *
   * КРИТИЧНО: URL кешируется ОДИН РАЗ и больше не меняется!
   * Это позволяет браузеру нормально кешировать изображения.
   */
  function getImageUrl(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): string | null {
    if (!filePath?.trim())
      return null

    // Генерируем ключ кеша
    const cacheKey = `${bucketName}:${filePath}:${JSON.stringify(options || {})}`

    // 💾 Проверяем кеш - ВОЗВРАЩАЕМ ТОТ ЖЕ URL
    if (imageUrlCache.has(cacheKey)) {
      const cachedUrl = imageUrlCache.get(cacheKey)
      if (cachedUrl) {
        console.log(`💾 Из кеша: ${cacheKey.slice(0, 50)}...`)
        return cachedUrl
      }
    }

    let url: string | null = null

    // Выбираем режим оптимизации
    if (IMAGE_OPTIMIZATION_ENABLED && options) {
      url = getOptimizedUrl(bucketName, filePath, options)
      console.log(`🚀 Supabase Transform`)
    }
    else {
      url = getPublicUrl(bucketName, filePath)
      console.log(`💾 Pre-optimized`)
    }

    // ✅ Добавляем timestamp ОДИН РАЗ при первом создании URL
    if (url) {
      const separator = url.includes('?') ? '&' : '?'
      const stableUrl = `${url}${separator}t=${Date.now()}`

      // Кешируем URL навсегда (пока не очистим кеш вручную)
      imageUrlCache.set(cacheKey, stableUrl)

      console.log(`🆕 Новый URL создан и закеширован`)
      return stableUrl
    }

    return null
  }

  function getImageUrlWithHeaders(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): { url: string | null, headers?: Record<string, string> } {
    if (!filePath?.trim())
      return { url: null }

    const url = getImageUrl(bucketName, filePath, options)

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=31536000', // Кешируем на год
      'Connection': 'keep-alive',
    }

    return { url, headers }
  }

  function clearImageCache(): void {
    const sizeBefore = imageUrlCache.size
    imageUrlCache.clear()
    console.log(`🧹 Кеш очищен (${sizeBefore} элементов)`)
  }

  function getCacheInfo(): { size: number, entries: Array<{ key: string, value: string }> } {
    const entries: Array<{ key: string, value: string }> = []
    imageUrlCache.forEach((value, key) => {
      entries.push({ key, value })
    })
    return { size: imageUrlCache.size, entries }
  }

  return {
    isLoading,
    uploadError,
    uploadFile,
    removeFile,
    getPublicUrl,
    getOptimizedUrl,
    getImageUrl, // 🎯 Используй везде эту функцию
    getImageUrlWithHeaders,
    clearImageCache,
    getCacheInfo,
  }
}
