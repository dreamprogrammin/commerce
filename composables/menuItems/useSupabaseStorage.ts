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
 * РЕЖИМЫ РАБОТЫ:
 *
 * БЕСПЛАТНЫЙ ТАРИФ (IMAGE_OPTIMIZATION_ENABLED = false):
 *   ✅ Публичные URLs без трансформации
 *   ✅ Локальная оптимизация перед загрузкой
 *   ✅ Стабильное кеширование
 *
 * ПЛАТНЫЙ ТАРИФ (IMAGE_OPTIMIZATION_ENABLED = true):
 *   ✅ Supabase Image Transformation API
 *   ✅ Трансформация на лету
 *   ✅ Автоматический WebP/AVIF
 */
export function useSupabaseStorage() {
  const supabase = useSupabaseClient<Database>()
  const config = useRuntimeConfig()

  const isLoading = ref(false)
  const uploadError = ref<string | null>(null)

  // 🗄️ Кеш URLs (стабильные, не меняются при повторных вызовах)
  const imageUrlCache = new Map<string, string>()

  /**
   * 📤 Загрузить файл в Supabase Storage
   */
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
      const { data, error } = await supabase.storage
        .from(options.bucketName)
        .upload(filePath, file, {
          cacheControl: options.cashControl || '3600',
          upsert: options.upsert === undefined ? true : options.upsert,
          contentType: options.contentType,
        })

      if (error)
        throw error

      toast.success('Файл загружен', { description: `${file.name} успешно` })
      return data.path
    }
    catch (e: any) {
      const message = e.message || `Ошибка загрузки в ${options.bucketName}`
      uploadError.value = message
      toast.error('Ошибка Storage', { description: message })
      console.error(`❌ Ошибка загрузки:`, e)
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 🗑️ Удалить файл(ы)
   */
  async function removeFile(
    bucketName: string,
    filePaths: string | string[],
  ): Promise<boolean> {
    const pathsToRemove = Array.isArray(filePaths) ? filePaths : [filePaths]
    const validPaths = pathsToRemove.filter(p => p && p.trim() !== '')

    if (validPaths.length === 0)
      return true

    try {
      const { error } = await supabase.storage.from(bucketName).remove(validPaths)
      if (error)
        throw error

      toast.success('Файлы удалены', {
        description: `${validPaths.length} файл(ов)`,
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

      return true
    }
    catch (e: any) {
      const message = e.message || `Ошибка удаления из ${bucketName}`
      toast.error('Ошибка Storage', { description: message })
      console.error(`❌ Ошибка удаления:`, e)
      return false
    }
  }

  /**
   * 🌍 Получить публичный URL (без трансформации)
   */
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
      console.error(`❌ Ошибка получения public URL:`, e)
      return null
    }
  }

  /**
   * 🚀 Получить URL с Supabase трансформацией (платный режим)
   */
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

      return `${baseUrl}/${filePath}${queryString}`
    }
    catch (e) {
      console.error(`❌ Ошибка optimized URL:`, e)
      return getPublicUrl(bucketName, filePath)
    }
  }

  /**
   * 🎯 ГЛАВНАЯ ФУНКЦИЯ: Универсальный получатель URL
   *
   * Автоматически выбирает режим:
   * - БЕСПЛАТНЫЙ: Публичный URL (оригинал)
   * - ПЛАТНЫЙ: Supabase Transformation
   *
   * @example
   * // Бесплатный режим
   * getImageUrl('products', 'path/to/image.jpg')
   * // → https://.../storage/v1/object/public/products/path/to/image.jpg
   *
   * // Платный режим
   * getImageUrl('products', 'path/to/image.jpg', { width: 400, quality: 80 })
   * // → https://.../storage/v1/render/image/public/products/path.jpg?width=400&quality=80
   */
  function getImageUrl(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): string | null {
    if (!filePath?.trim())
      return null

    // Генерируем ключ кеша (БЕЗ timestamp - он добавится один раз)
    const cacheKey = `${bucketName}:${filePath}:${JSON.stringify(options || {})}:${IMAGE_OPTIMIZATION_ENABLED}`

    // 💾 Проверяем кеш - ВОЗВРАЩАЕМ СТАБИЛЬНЫЙ URL
    if (imageUrlCache.has(cacheKey)) {
      return imageUrlCache.get(cacheKey) || null
    }

    let url: string | null = null

    // 🎯 ВЫБОР РЕЖИМА
    if (IMAGE_OPTIMIZATION_ENABLED && options) {
      // ✅ ПЛАТНЫЙ: Supabase Transformation
      url = getOptimizedUrl(bucketName, filePath, options)
    }
    else {
      // ✅ БЕСПЛАТНЫЙ: Публичный URL
      url = getPublicUrl(bucketName, filePath)
    }

    // Кешируем URL (БЕЗ timestamp для стабильности)
    if (url) {
      imageUrlCache.set(cacheKey, url)
      return url
    }

    return null
  }

  /**
   * 🧹 Очистить кеш
   */
  function clearImageCache(): void {
    const sizeBefore = imageUrlCache.size
    imageUrlCache.clear()
    console.log(`🧹 Кеш очищен (${sizeBefore} URLs)`)
  }

  /**
   * 📊 Информация о кеше
   */
  function getCacheInfo(): {
    size: number
    mode: string
    entries: Array<{ key: string, value: string }>
  } {
    const entries: Array<{ key: string, value: string }> = []
    imageUrlCache.forEach((value, key) => {
      entries.push({ key, value })
    })

    return {
      size: imageUrlCache.size,
      mode: IMAGE_OPTIMIZATION_ENABLED ? 'Supabase Transform' : 'Public URLs',
      entries,
    }
  }

  // 📊 Логирование текущего режима при инициализации
  if (import.meta.env.DEV) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️  РЕЖИМ ИЗОБРАЖЕНИЙ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${IMAGE_OPTIMIZATION_ENABLED
    ? '🚀 ПЛАТНЫЙ: Supabase Image Transformation\n   ✅ Трансформация на лету\n   ✅ WebP/AVIF автоматически'
    : '💾 БЕСПЛАТНЫЙ: Public URLs\n   ✅ Локальная оптимизация при загрузке\n   ✅ Простые публичные URLs'
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `)
  }

  return {
    // State
    isLoading,
    uploadError,

    // Methods
    uploadFile,
    removeFile,

    // URL генераторы
    getPublicUrl,
    getOptimizedUrl,
    getImageUrl, // 🎯 ОСНОВНОЙ - используй везде

    // Утилиты
    clearImageCache,
    getCacheInfo,
  }
}
