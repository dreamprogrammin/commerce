import type { Database, IUploadFileOptions } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'
import {
  CLOUDFLARE_BYPASS,
  IMAGE_OPTIMIZATION_ENABLED,
  OPTIMIZATION_CONFIG,
} from '@/config/images'

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'avif' | 'jpeg' | 'png'
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * 🖼️ УНИВЕРСАЛЬНЫЙ Composable для работы с Supabase Storage
 *
 * 🎯 АВТОМАТИЧЕСКИ ПЕРЕКЛЮЧАЕТСЯ между режимами:
 *
 * БЕСПЛАТНЫЙ ТАРИФ (IMAGE_OPTIMIZATION_ENABLED = false):
 *   ✅ API Proxy для обхода Cloudflare
 *   ✅ Оригинальные изображения (предоптимизированные)
 *   ✅ Стабильное кеширование
 *
 * ПЛАТНЫЙ ТАРИФ (IMAGE_OPTIMIZATION_ENABLED = true):
 *   ✅ Supabase Image Transformation API
 *   ✅ Трансформация на лету (resize, format, quality)
 *   ✅ Автоматический WebP/AVIF
 *
 * Просто измените IMAGE_OPTIMIZATION_ENABLED в config/images.ts!
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
      console.log(`📤 Загружаем: ${uniqueFileName} → ${options.bucketName}`)

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
      toast.success('Файл загружен', { description: `${file.name} успешно` })

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
      console.log(`🗑️ Удаляем из ${bucketName}: ${validPaths.length} файлов`)

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
   * 🛡️ Получить URL через API Proxy (бесплатный режим)
   */
  function getProxyUrl(
    bucketName: string,
    filePath: string | null,
  ): string | null {
    if (!filePath?.trim())
      return null

    // Формируем URL через наш API proxy
    return `${CLOUDFLARE_BYPASS.PROXY_PATH}/${bucketName}/${filePath}`
  }

  /**
   * 🎯 ГЛАВНАЯ ФУНКЦИЯ: Универсальный получатель URL
   *
   * Автоматически выбирает режим:
   * - БЕСПЛАТНЫЙ: API Proxy
   * - ПЛАТНЫЙ: Supabase Transformation
   *
   * @example
   * // Бесплатный режим
   * getImageUrl('products', 'path/to/image.jpg')
   * // → /api/image-proxy/products/path/to/image.jpg
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

    // Генерируем ключ кеша
    const cacheKey = `${bucketName}:${filePath}:${JSON.stringify(options || {})}:${IMAGE_OPTIMIZATION_ENABLED}`

    // 💾 Проверяем кеш
    if (imageUrlCache.has(cacheKey)) {
      const cachedUrl = imageUrlCache.get(cacheKey)
      if (cachedUrl) {
        // console.log(`💾 Кеш: ${bucketName}/${filePath.split('/').pop()}`)
        return cachedUrl
      }
    }

    let url: string | null = null

    // 🎯 ВЫБОР РЕЖИМА
    if (IMAGE_OPTIMIZATION_ENABLED && options) {
      // ✅ ПЛАТНЫЙ РЕЖИМ: Supabase Transformation
      url = getOptimizedUrl(bucketName, filePath, options)
      console.log(`🚀 Режим: Supabase Transform (${options.width}x${options.height}, ${options.format})`)
    }
    else {
      // ✅ БЕСПЛАТНЫЙ РЕЖИМ: API Proxy
      url = getProxyUrl(bucketName, filePath)
      console.log(`🛡️ Режим: API Proxy (обход Cloudflare)`)
    }

    // ✅ Добавляем timestamp ОДИН РАЗ для cache busting
    if (url) {
      const separator = url.includes('?') ? '&' : '?'
      const stableUrl = `${url}${separator}t=${Date.now()}`

      // Кешируем навсегда
      imageUrlCache.set(cacheKey, stableUrl)

      return stableUrl
    }

    return null
  }

  /**
   * 🛡️ Получить URL с заголовками (для fetch запросов)
   */
  function getImageUrlWithHeaders(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): { url: string | null, headers?: Record<string, string> } {
    if (!filePath?.trim())
      return { url: null }

    const url = getImageUrl(bucketName, filePath, options)

    // Заголовки только для прямых запросов (не для proxy)
    const headers = IMAGE_OPTIMIZATION_ENABLED
      ? CLOUDFLARE_BYPASS.HEADERS
      : undefined

    return { url, headers }
  }

  /**
   * 🧹 Очистить кеш (при переключении режима или обновлении изображений)
   */
  function clearImageCache(): void {
    const sizeBefore = imageUrlCache.size
    imageUrlCache.clear()
    console.log(`🧹 Кеш очищен (${sizeBefore} URLs)`)
    toast.info('Кеш очищен', { description: `${sizeBefore} URLs` })
  }

  /**
   * 📊 Информация о кеше (для отладки)
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
      mode: IMAGE_OPTIMIZATION_ENABLED ? 'Supabase Transform' : 'API Proxy',
      entries,
    }
  }

  /**
   * 🔄 Переключить режим (для тестирования)
   * ВНИМАНИЕ: Требует перезагрузки страницы для применения
   */
  function toggleOptimizationMode(): void {
    console.warn('⚠️ Для переключения режима измените IMAGE_OPTIMIZATION_ENABLED в config/images.ts')
    console.log(`Текущий режим: ${IMAGE_OPTIMIZATION_ENABLED ? 'Платный (Transform)' : 'Бесплатный (Proxy)'}`)
  }

  // 📊 Логирование текущего режима при инициализации
  if (import.meta.env.DEV) {
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️  РЕЖИМ ИЗОБРАЖЕНИЙ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${IMAGE_OPTIMIZATION_ENABLED
    ? '🚀 ПЛАТНЫЙ: Supabase Image Transformation\n   ✅ Трансформация на лету\n   ✅ WebP/AVIF автоматически\n   ✅ Resize, качество, формат'
    : '🛡️  БЕСПЛАТНЫЙ: API Proxy + Pre-optimized\n   ✅ Обход Cloudflare\n   ✅ Кеширование на год\n   ✅ Без трансформаций'
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
    getProxyUrl,
    getImageUrl, // 🎯 ОСНОВНОЙ - используй везде
    getImageUrlWithHeaders,

    // Утилиты
    clearImageCache,
    getCacheInfo,
    toggleOptimizationMode,
  }
}
