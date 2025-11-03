import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_QUALITY, OPTIMIZATION_RECOMMENDATIONS } from '@/config/images'

/**
 * 🎨 Результат генерации blur placeholder
 */
export interface BlurPlaceholderResult {
  dataUrl: string // base64 data URL
  width: number
  height: number
}

/**
 * 🎨 Генерирует blur placeholder для LQIP (Low-Quality Image Placeholder)
 *
 * Создает крошечное изображение (20x20px) в base64 для мгновенного показа
 * пока грузится полное изображение (как на Medium.com)
 *
 * @param file - исходный файл изображения
 * @param maxSize - максимальный размер стороны (по умолчанию 20px)
 * @param quality - качество сжатия (по умолчанию 0.5)
 * @returns Promise с base64 data URL
 */
export async function generateBlurPlaceholder(
  file: File,
  maxSize = 20,
  quality = 0.5,
): Promise<BlurPlaceholderResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file) // 🔧 Используем объектный URL

    img.onload = () => {
      try {
        // Вычисляем пропорциональные размеры
        let { width, height } = img

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width)
            width = maxSize
          }
        }
        else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height)
            height = maxSize
          }
        }

        // Создаем крошечный canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d', { willReadFrequently: false }) // 🔧 Оптимизация
        if (!ctx) {
          URL.revokeObjectURL(objectUrl) // 🔧 Очищаем
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Рисуем с максимальным размытием
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'low'
        ctx.drawImage(img, 0, 0, width, height)

        // Конвертируем в data URL
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality)

          // 🔧 Очищаем ресурсы
          URL.revokeObjectURL(objectUrl)
          canvas.width = 0
          canvas.height = 0

          resolve({
            dataUrl,
            width,
            height,
          })
        }
        catch (canvasError) {
          URL.revokeObjectURL(objectUrl)
          reject(canvasError)
        }
      }
      catch (error) {
        URL.revokeObjectURL(objectUrl)
        reject(error)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl // 🔧 Используем объектный URL вместо FileReader
  })
}

/**
 * 🎨 Результат оптимизации изображения
 */
export interface OptimizationResult {
  file: File
  originalSize: number
  optimizedSize: number
  savings: number // процент экономии
  blurPlaceholder?: string // 🆕 base64 blur preview
}

/**
 * 📊 Информация о режиме оптимизации
 */
export interface OptimizationInfo {
  name: string
  icon: string
  description: string
  recommendation: string
}

/**
 * 🎯 Получить информацию о текущем режиме оптимизации
 *
 * @returns объект с информацией о режиме
 *
 * @example
 * const info = getOptimizationInfo()
 * console.log(info.name) // "Бесплатный тариф"
 * console.log(info.icon) // "💾"
 */
export function getOptimizationInfo(): OptimizationInfo {
  if (IMAGE_OPTIMIZATION_ENABLED) {
    return {
      name: 'Платный тариф',
      icon: '🚀',
      description: 'Supabase Image Transformation (трансформация на лету)',
      recommendation: 'Загружайте оригиналы высокого качества - Supabase оптимизирует их автоматически',
    }
  }

  return {
    name: 'Бесплатный тариф',
    icon: '💾',
    description: 'Локальная оптимизация через Canvas API',
    recommendation: 'Изображения оптимизируются локально перед загрузкой для экономии трафика',
  }
}

/**
 * 📏 Форматирует размер файла в читаемый вид
 *
 * @param bytes - размер в байтах
 * @returns строка типа "1.5 MB" или "350 KB"
 *
 * @example
 * formatFileSize(1500000) // "1.43 MB"
 * formatFileSize(50000)   // "48.8 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`
}

/**
 * 🎯 Проверяет нужна ли оптимизация для файла
 *
 * Логика:
 * - Если платный тариф (IMAGE_OPTIMIZATION_ENABLED = true) → НЕ оптимизируем (загружаем оригиналы)
 * - Если бесплатный тариф → оптимизируем файлы > 500KB
 *
 * @param file - файл для проверки
 * @returns true если нужна локальная оптимизация
 *
 * @example
 * const file = new File([blob], 'image.jpg')
 * if (shouldOptimizeImage(file)) {
 *   await optimizeImageBeforeUpload(file)
 * }
 */
export function shouldOptimizeImage(file: File): boolean {
  // 🚀 Платный тариф - НЕ оптимизируем (Supabase сделает это сам)
  if (IMAGE_OPTIMIZATION_ENABLED) {
    return false
  }

  // 🛡️ Бесплатный тариф - оптимизируем файлы > 500KB
  const threshold = 500 * 1024 // 500KB
  return file.size > threshold
}

/**
 * 🎨 Оптимизирует изображение перед загрузкой
 *
 * Использует Canvas API для:
 * - Изменения размера (если больше рекомендуемого)
 * - Конвертации в WebP (меньший размер)
 * - Сжатия с настраиваемым качеством
 * - 🆕 Генерации blur placeholder для LQIP
 *
 * @param file - исходный файл изображения
 * @param maxWidth - максимальная ширина (по умолчанию 2000px)
 * @param maxHeight - максимальная высота (по умолчанию 2000px)
 * @param quality - качество сжатия (0-1, по умолчанию 0.85)
 * @param generateBlur - генерировать ли blur placeholder (по умолчанию true)
 * @returns Promise с результатом оптимизации
 *
 * @example
 * const result = await optimizeImageBeforeUpload(file)
 * console.log(`Экономия: ${result.savings}%`)
 * console.log(`Blur: ${result.blurPlaceholder}`) // base64 string
 */
export async function optimizeImageBeforeUpload(
  file: File,
  maxWidth = OPTIMIZATION_RECOMMENDATIONS.RECOMMENDED_UPLOAD_DIMENSIONS.width,
  maxHeight = OPTIMIZATION_RECOMMENDATIONS.RECOMMENDED_UPLOAD_DIMENSIONS.height,
  quality = IMAGE_QUALITY.HIGH / 100, // 85 / 100 = 0.85
  generateBlur = true,
): Promise<OptimizationResult> {
  const originalSize = file.size

  // 🎨 Генерируем blur placeholder параллельно
  const blurPromise = generateBlur
    ? generateBlurPlaceholder(file).catch(() => null)
    : Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    img.onload = async () => {
      try {
        // Вычисляем новые размеры (пропорционально)
        let { width, height } = img

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.floor(width * ratio)
          height = Math.floor(height * ratio)
        }

        // Создаем canvas
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Рисуем изображение с оптимальным качеством
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)

        // Конвертируем в WebP (или JPEG если WebP не поддерживается)
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'))
              return
            }

            const optimizedSize = blob.size
            const savings = ((originalSize - optimizedSize) / originalSize) * 100

            // Создаем новый файл
            const optimizedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.webp'), // Меняем расширение на .webp
              { type: 'image/webp' },
            )

            // Ждем blur placeholder
            const blurResult = await blurPromise

            resolve({
              file: optimizedFile,
              originalSize,
              optimizedSize,
              savings: Math.max(0, savings),
              blurPlaceholder: blurResult?.dataUrl, // 🆕 Добавляем blur
            })
          },
          'image/webp',
          quality,
        )
      }
      catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * 📊 Валидация файла изображения
 *
 * Проверяет:
 * - Является ли файл изображением
 * - Не превышает ли максимальный размер
 * - Поддерживается ли формат
 *
 * @param file - файл для проверки
 * @returns объект с результатом валидации
 *
 * @example
 * const validation = validateImageFile(file)
 * if (!validation.isValid) {
 *   toast.error(validation.error)
 * }
 */
export function validateImageFile(file: File): {
  isValid: boolean
  error?: string
} {
  // Проверяем тип
  if (!file.type.startsWith('image/')) {
    return {
      isValid: false,
      error: 'Файл должен быть изображением',
    }
  }

  // Проверяем поддерживаемые форматы
  const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!supportedFormats.includes(file.type)) {
    return {
      isValid: false,
      error: `Формат ${file.type} не поддерживается. Используйте: JPEG, PNG, WebP`,
    }
  }

  // Проверяем размер
  const maxSizeBytes = OPTIMIZATION_RECOMMENDATIONS.MAX_ORIGINAL_SIZE_MB * 1024 * 1024
  if (file.size > maxSizeBytes) {
    return {
      isValid: false,
      error: `Файл слишком большой (${formatFileSize(file.size)}). Максимум: ${OPTIMIZATION_RECOMMENDATIONS.MAX_ORIGINAL_SIZE_MB}MB`,
    }
  }

  return { isValid: true }
}

/**
 * 🎯 Пакетная оптимизация изображений
 *
 * @param files - массив файлов для оптимизации
 * @param onProgress - callback для отслеживания прогресса
 * @returns Promise с массивом результатов
 *
 * @example
 * const results = await optimizeImagesBatch(files, (current, total) => {
 *   console.log(`Обработано ${current} из ${total}`)
 * })
 */
export async function optimizeImagesBatch(
  files: File[],
  onProgress?: (current: number, total: number) => void,
): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    // Проверяем что файл существует
    if (!file) {
      console.warn(`File at index ${i} is undefined, skipping`)
      continue
    }

    if (shouldOptimizeImage(file)) {
      try {
        const result = await optimizeImageBeforeUpload(file)
        results.push(result)
      }
      catch (error) {
        console.error(`Failed to optimize ${file.name}:`, error)
        // Добавляем оригинал если не удалось оптимизировать
        results.push({
          file,
          originalSize: file.size,
          optimizedSize: file.size,
          savings: 0,
        })
      }
    }
    else {
      // Файл не требует оптимизации
      results.push({
        file,
        originalSize: file.size,
        optimizedSize: file.size,
        savings: 0,
      })
    }

    onProgress?.(i + 1, files.length)
  }

  return results
}
