/**
 * 🖼️ Утилита для оптимизации изображений ПЕРЕД загрузкой в Supabase
 * Используется только когда IMAGE_OPTIMIZATION_ENABLED = false (бесплатный тариф)
 */

export interface ImageOptimizationOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0.0 - 1.0
  format?: 'webp' | 'jpeg' | 'png'
}

export interface OptimizationResult {
  file: File
  originalSize: number
  optimizedSize: number
  savings: number // процент экономии
}

/**
 * Оптимизирует изображение перед загрузкой
 */
export async function optimizeImageBeforeUpload(
  file: File,
  options: ImageOptimizationOptions = {},
): Promise<OptimizationResult> {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.85,
    format = 'webp',
  } = options

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const originalSize = file.size

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Не удалось получить canvas context'))
          return
        }

        let { width, height } = img

        // Расчет новых размеров с сохранением пропорций
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        }
        else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height

        // Улучшаем качество рендеринга
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // Рисуем изображение
        ctx.drawImage(img, 0, 0, width, height)

        // Определяем MIME type
        const mimeType = format === 'webp' ? 'image/webp' : `image/${format}`

        // Конвертируем в blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Не удалось оптимизировать изображение'))
              return
            }

            const optimizedSize = blob.size
            const savings = ((1 - optimizedSize / originalSize) * 100)

            // Создаем новый файл с правильным расширением
            const extension = format === 'webp' ? '.webp' : `.${format}`
            const newFileName = file.name.replace(/\.[^.]+$/, extension)

            const optimizedFile = new File(
              [blob],
              newFileName,
              {
                type: mimeType,
                lastModified: Date.now(),
              },
            )

            resolve({
              file: optimizedFile,
              originalSize,
              optimizedSize,
              savings,
            })
          },
          mimeType,
          quality,
        )
      }

      img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
      img.src = e.target?.result as string
    }

    reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
    reader.readAsDataURL(file)
  })
}

/**
 * Форматирует размер файла для отображения
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`
}

/**
 * Пакетная оптимизация нескольких изображений
 */
export async function optimizeMultipleImages(
  files: File[],
  options: ImageOptimizationOptions = {},
): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = []

  for (const file of files) {
    try {
      const result = await optimizeImageBeforeUpload(file, options)
      results.push(result)
    }
    catch (error) {
      console.error(`Ошибка оптимизации ${file.name}:`, error)
      // В случае ошибки возвращаем оригинальный файл
      results.push({
        file,
        originalSize: file.size,
        optimizedSize: file.size,
        savings: 0,
      })
    }
  }

  return results
}

/**
 * Проверяет, нужно ли оптимизировать изображение
 */
export function shouldOptimizeImage(file: File, maxSize: number = 500 * 1024): boolean {
  // Оптимизируем, если:
  // 1. Файл больше maxSize (по умолчанию 500KB)
  // 2. Это не WebP формат
  return file.size > maxSize || !file.type.includes('webp')
}
