import type { Database, IUploadFileOptions } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'vue-sonner'

export interface ImageTransformOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'webp' | 'avif' | 'jpeg' | 'png'
  resize?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
}

export function useSupabaseStorage() {
  const supabase = useSupabaseClient<Database>()
  const config = useRuntimeConfig()
  const isLoading = ref(false)
  const uploadError = ref<string | null>(null)

  async function uploadFile(
    file: File,
    options: IUploadFileOptions,
  ): Promise<string | null> {
    isLoading.value = true
    uploadError.value = null

    if (!file) {
      const noFileError = 'Файл не загружен'
      uploadError.value = noFileError
      toast.error('Ошибка загрузки', {
        description: noFileError,
      })
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

      return data.path
    }
    catch (e: any) {
      const message
        = e.message || `Ошибка загрузки файла в бакет ${options.bucketName}.`
      uploadError.value = message
      toast.error('Ошибка Storage', {
        description: message,
      })
      console.error(
        `Error uploading to bucket "${options.bucketName}", path "${filePath}":`,
        e,
      )
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
    const validPathsToRemove = pathsToRemove.filter(
      p => p && p.trim() !== '',
    )
    if (validPathsToRemove.length === 0)
      return true

    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .remove(validPathsToRemove)
      if (error)
        throw error
      toast.info('Информация Storage', {
        description: `Файл(ы) удалены(ы) из ${bucketName}.`,
      })
      return true
    }
    catch (e: any) {
      const message
        = e.message || `Ошибка удаления файла(ов) из бакета ${bucketName}.`
      toast.error('Ошибка Storage', {
        description: message,
      })
      console.error(
        `Error removing files from bucket "${bucketName}", paths "${validPathsToRemove.join(', ')}":`,
        e,
      )
      return false
    }
  }

  /**
   * Получить публичный URL без трансформации (оригинальное изображение)
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
      return data?.publicUrl || null
    }
    catch (e) {
      console.error(
        `Error getting public URL for "${filePath}" in bucket "${bucketName}":`,
        e,
      )
      return null
    }
  }

  /**
   * Получить оптимизированный URL с трансформацией через Supabase Image Transformation API
   * @param bucketName - название бакета
   * @param filePath - путь к файлу
   * @param options - опции трансформации (width, height, quality, format, resize)
   * @returns оптимизированный URL или null
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

      // Формируем параметры
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

      // Используем Supabase Image Transformation API
      const baseUrl = `${config.public.supabase.url}/storage/v1/render/image/public/${bucketName}`
      return `${baseUrl}/${filePath}${queryString}`
    }
    catch (e) {
      console.error(
        `Error getting optimized URL for "${filePath}" in bucket "${bucketName}":`,
        e,
      )
      // Fallback на обычный публичный URL
      return getPublicUrl(bucketName, filePath)
    }
  }

  return {
    isLoading,
    uploadError,
    uploadFile,
    removeFile,
    getPublicUrl,
    getOptimizedUrl, // 👈 Новый метод для оптимизации
  }
}
