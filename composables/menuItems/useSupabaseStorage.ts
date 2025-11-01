import type { Database, IUploadFileOptions } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'
import { IMAGE_OPTIMIZATION_ENABLED } from '@/config/images'

/**
 * Опции для трансформации изображений через Supabase
 */
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
 * Функционал:
 * - ✅ Загрузка файлов с кешированием
 * - ✅ Удаление файлов
 * - ✅ Получение публичных URLs
 * - ✅ Трансформация изображений через Supabase API
 * - ✅ Кеширование URLs в памяти
 * - ✅ Обход Cloudflare bot detection
 * - ✅ Поддержка обеих стратегий оптимизации (локальная и облачная)
 */
export function useSupabaseStorage() {
  const supabase = useSupabaseClient<Database>()
  const config = useRuntimeConfig()

  // --- СОСТОЯНИЕ ---
  const isLoading = ref(false)
  const uploadError = ref<string | null>(null)

  // 🗄️ Кеш для URLs (избегаем пересчета для одного файла)
  const imageUrlCache = new Map<string, string>()

  /**
   * 📤 Загрузить файл в Supabase Storage
   *
   * @param file - файл для загрузки
   * @param options - опции загрузки (bucketName, filePathPrefix, etc)
   * @returns путь к файлу в storage или null при ошибке
   *
   * @example
   * const path = await uploadFile(file, {
   *   bucketName: 'products',
   *   filePathPrefix: 'products/123'
   * })
   */
  async function uploadFile(
    file: File,
    options: IUploadFileOptions,
  ): Promise<string | null> {
    isLoading.value = true
    uploadError.value = null

    // Валидация файла
    if (!file) {
      const noFileError = 'Файл не загружен'
      uploadError.value = noFileError
      toast.error('Ошибка загрузки', {
        description: noFileError,
      })
      isLoading.value = false
      return null
    }

    // Генерируем уникальное имя файла
    const fileExt = file.name.split('.').pop()
    const uniqueFileName = `${uuidv4()}${fileExt ? `.${fileExt}` : ''}`
    const filePath = options.filePathPrefix
      ? `${options.filePathPrefix.replace(/\/$/, '')}/${uniqueFileName}`
      : uniqueFileName

    try {
      console.log(`📤 Загружаем файл: ${uniqueFileName} → ${options.bucketName}/${filePath}`)

      const { data, error } = await supabase.storage
        .from(options.bucketName)
        .upload(filePath, file, {
          cacheControl: options.cashControl || '3600',
          upsert: options.upsert === undefined ? true : options.upsert,
          contentType: options.contentType,
        })

      if (error)
        throw error

      console.log(`✅ Файл успешно загружен: ${data.path}`)
      toast.success('Файл загружен', {
        description: `${file.name} успешно загружен`,
      })

      return data.path
    }
    catch (e: any) {
      const message = e.message || `Ошибка загрузки файла в бакет ${options.bucketName}.`
      uploadError.value = message
      toast.error('Ошибка Storage', {
        description: message,
      })
      console.error(
        `❌ Error uploading to bucket "${options.bucketName}", path "${filePath}":`,
        e,
      )
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 🗑️ Удалить файл(ы) из Supabase Storage
   *
   * @param bucketName - название бакета
   * @param filePaths - путь(и) к файлу(ам) (строка или массив)
   * @returns true если успешно, false при ошибке
   *
   * @example
   * await removeFile('products', 'path/to/file.jpg')
   * await removeFile('products', ['path/1.jpg', 'path/2.jpg'])
   */
  async function removeFile(
    bucketName: string,
    filePaths: string | string[],
  ): Promise<boolean> {
    const pathsToRemove = Array.isArray(filePaths) ? filePaths : [filePaths]
    const validPathsToRemove = pathsToRemove.filter(
      p => p && p.trim() !== '',
    )

    if (validPathsToRemove.length === 0)
      return true

    try {
      console.log(`🗑️ Удаляем файлы из ${bucketName}: ${validPathsToRemove.join(', ')}`)

      const { error } = await supabase.storage
        .from(bucketName)
        .remove(validPathsToRemove)

      if (error)
        throw error

      toast.success('Файлы удалены', {
        description: `${validPathsToRemove.length} файл(ов) удалено из ${bucketName}`,
      })

      // Очищаем кеш для удаленных файлов
      validPathsToRemove.forEach((path) => {
        const cacheKeysToDelete: string[] = []
        imageUrlCache.forEach((_, key) => {
          if (key.includes(path)) {
            cacheKeysToDelete.push(key)
          }
        })
        cacheKeysToDelete.forEach(key => imageUrlCache.delete(key))
      })

      console.log(`✅ Файлы успешно удалены`)
      return true
    }
    catch (e: any) {
      const message = e.message || `Ошибка удаления файла(ов) из бакета ${bucketName}.`
      toast.error('Ошибка Storage', {
        description: message,
      })
      console.error(
        `❌ Error removing files from bucket "${bucketName}", paths "${validPathsToRemove.join(', ')}":`,
        e,
      )
      return false
    }
  }

  /**
   * 🌍 Получить публичный URL без трансформации (оригинальное изображение)
   *
   * @param bucketName - название бакета
   * @param filePath - путь к файлу
   * @returns публичный URL или null
   *
   * @example
   * const url = getPublicUrl('products', 'products/123/image.jpg')
   * // https://project.supabase.co/storage/v1/object/public/products/products/123/image.jpg
   */
  function getPublicUrl(
    bucketName: string,
    filePath: string | null,
  ): string | null {
    if (!filePath || !filePath.trim()) {
      return null
    }

    try {
      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)
      const url = data?.publicUrl || null

      if (url) {
        console.log(`🌍 Public URL (${bucketName}): ${url}`)
      }

      return url
    }
    catch (e) {
      console.error(
        `❌ Error getting public URL for "${filePath}" in bucket "${bucketName}":`,
        e,
      )
      return null
    }
  }

  /**
   * 🚀 Получить оптимизированный URL с трансформацией
   * Использует Supabase Image Transformation API для оптимизации на лету
   *
   * @param bucketName - название бакета
   * @param filePath - путь к файлу
   * @param options - опции трансформации (width, height, quality, format, resize)
   * @returns оптимизированный URL или null
   *
   * @example
   * const url = getOptimizedUrl('products', 'products/123/image.jpg', {
   *   width: 400,
   *   height: 400,
   *   quality: 80,
   *   format: 'webp',
   *   resize: 'cover'
   * })
   */
  function getOptimizedUrl(
    bucketName: string,
    filePath: string | null,
    options: ImageTransformOptions = {},
  ): string | null {
    if (!filePath || !filePath.trim()) {
      return null
    }

    try {
      const {
        width,
        height,
        quality = 80,
        format = 'webp',
        resize = 'cover',
      } = options

      // Формируем параметры трансформации
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

      // Используем Supabase Image Transformation API через render endpoint
      const baseUrl = `${config.public.supabase.url}/storage/v1/render/image/public/${bucketName}`
      const url = `${baseUrl}/${filePath}${queryString}`

      console.log(`🚀 Optimized URL (${format} ${width}x${height}): ${url}`)

      return url
    }
    catch (e) {
      console.error(
        `❌ Error getting optimized URL for "${filePath}" in bucket "${bucketName}":`,
        e,
      )
      // Fallback на обычный публичный URL
      return getPublicUrl(bucketName, filePath)
    }
  }

  /**
   * 🛡️ Получить URL с заголовками для обхода Cloudflare bot detection
   * Возвращает URL и рекомендуемые заголовки для запроса
   *
   * @param bucketName - название бакета
   * @param filePath - путь к файлу
   * @param options - опции трансформации
   * @returns объект с URL и заголовками
   *
   * @example
   * const { url, headers } = getImageUrlWithHeaders('products', 'image.jpg', { width: 400 })
   * fetch(url, { headers })
   */
  function getImageUrlWithHeaders(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): { url: string | null, headers?: Record<string, string> } {
    if (!filePath || !filePath.trim()) {
      return { url: null }
    }

    const url = getImageUrl(bucketName, filePath, options)

    // Заголовки для обхода Cloudflare bot detection
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    }

    return { url, headers }
  }

  /**
   * 🎯 УНИВЕРСАЛЬНАЯ ФУНКЦИЯ для получения URL изображения
   * Автоматически использует оптимизацию или обычный URL в зависимости от конфига
   *
   * ✅ Кеширует результаты для оптимизации производительности
   * ✅ Поддерживает обе стратегии: локальная оптимизация и облачная трансформация
   * ✅ 🛡️ Добавляет timestamp ОДИН РАЗ при первой загрузке (не на каждый вызов)
   *
   * @param bucketName - название бакета
   * @param filePath - путь к файлу
   * @param options - опции трансформации (игнорируются если оптимизация отключена)
   * @returns URL изображения (кешированный, одинаковый для одного файла)
   *
   * @example
   * // С оптимизацией (если включена в config/images.ts)
   * const url = getImageUrl('products', 'products/123/image.jpg', { width: 400, quality: 80 })
   *
   * // Без параметров (вернет оригинал если оптимизация отключена)
   * const url = getImageUrl('products', 'products/123/image.jpg')
   */
  function getImageUrl(
    bucketName: string,
    filePath: string | null,
    options?: ImageTransformOptions,
  ): string | null {
    if (!filePath || !filePath.trim()) {
      return null
    }

    // Генерируем ключ кеша
    const cacheKey = `${bucketName}:${filePath}:${JSON.stringify(options || {})}`

    // 💾 Проверяем кеш - ВОЗВРАЩАЕМ ОДИНАКОВЫЙ URL для одного файла
    if (imageUrlCache.has(cacheKey)) {
      const cachedUrl = imageUrlCache.get(cacheKey)
      if (cachedUrl) {
        console.log(`💾 Используем закешированный URL: ${cacheKey}`)
        // ✅ ВАЖНО: Возвращаем ОДИНАКОВЫЙ кешированный URL, без нового timestamp
        // Это позволяет браузеру использовать свой кеш и не переzагружать
        return cachedUrl
      }
    }

    let url: string | null = null

    // ✅ Проверяем глобальный флаг из конфига
    if (IMAGE_OPTIMIZATION_ENABLED && options) {
      // 🚀 РЕЖИМ 1: Платный тариф - используем Supabase трансформацию
      url = getOptimizedUrl(bucketName, filePath, options)
      console.log(`🚀 Режим: Supabase Transform (платный)`)
    }
    else {
      // 💾 РЕЖИМ 2: Бесплатный тариф - возвращаем оригинал (уже оптимизирован локально)
      url = getPublicUrl(bucketName, filePath)
      console.log(`💾 Режим: Pre-optimized (бесплатный)`)
    }

    // 🛡️ Добавляем timestamp ОДИН РАЗ при первой загрузке
    // Это обходит Cloudflare bot detection, но браузер может кешировать результат
    if (url) {
      const separator = url.includes('?') ? '&' : '?'
      const urlWithTimestamp = `${url}${separator}t=${Date.now()}`

      // Кешируем URL с timestamp
      imageUrlCache.set(cacheKey, urlWithTimestamp)

      console.log(`🆕 Новый URL с timestamp: ${cacheKey}`)
      return urlWithTimestamp
    }

    return null
  }

  /**
   * 🧹 Очистить весь кеш URLs
   * Используется если нужно пересчитать URLs вручную
   *
   * @example
   * clearImageCache()  // После обновления изображений
   */
  function clearImageCache(): void {
    const sizeBefore = imageUrlCache.size
    imageUrlCache.clear()
    console.log(`🧹 Кеш очищен (было ${sizeBefore} элементов)`)
  }

  /**
   * 📊 Получить информацию о кеше
   * Для отладки и мониторинга
   *
   * @returns объект с информацией о кеше
   *
   * @example
   * console.log(getCacheInfo())
   * // { size: 42, entries: [...] }
   */
  function getCacheInfo(): { size: number, entries: Array<{ key: string, value: string }> } {
    const entries: Array<{ key: string, value: string }> = []
    imageUrlCache.forEach((value, key) => {
      entries.push({ key, value })
    })
    return { size: imageUrlCache.size, entries }
  }

  // --- ЭКСПОРТ ---
  return {
    // State
    isLoading,
    uploadError,

    // Methods
    uploadFile,
    removeFile,
    getPublicUrl,
    getOptimizedUrl,
    getImageUrl, // 🎯 ОСНОВНАЯ функция - используй везде
    getImageUrlWithHeaders,
    clearImageCache,
    getCacheInfo,
  }
}
