import imageCompression from 'browser-image-compression'
import { IMAGE_OPTIMIZATION_ENABLED, OPTIMIZATION_RECOMMENDATIONS } from '@/config/images'

/**
 * 🎨 Результат генерации blur placeholder
 */
export interface BlurPlaceholderResult {
  dataUrl: string // base64 data URL
  width: number
  height: number
}

/**
 * 🎨 Результат оптимизации изображения
 */
export interface OptimizationResult {
  file: File
  originalSize: number
  optimizedSize: number
  savings: number // процент экономии
  blurPlaceholder?: string // base64 blur preview
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
    description: 'Локальная оптимизация через browser-image-compression',
    recommendation: 'Изображения оптимизируются локально перед загрузкой для экономии трафика',
  }
}

/**
 * 📏 Форматирует размер файла в читаемый вид
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
 * На бесплатном тарифе ВСЕГДА сжимаем — гарантируем WebP + 1200px + <150KB
 */
export function shouldOptimizeImage(_file: File): boolean {
  // Платный тариф — Supabase оптимизирует сам
  if (IMAGE_OPTIMIZATION_ENABLED)
    return false

  // Бесплатный тариф — всегда сжимаем
  return true
}

/**
 * 🎨 Генерирует blur placeholder для LQIP (Low-Quality Image Placeholder)
 *
 * Создаёт крошечное изображение (20px) в base64 для мгновенного показа
 * пока грузится полное изображение (как на Medium.com)
 */
export async function generateBlurPlaceholder(
  file: File,
  maxSize = 20,
): Promise<BlurPlaceholderResult> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.002,
    maxWidthOrHeight: maxSize,
    useWebWorker: true,
  })
  const dataUrl = await imageCompression.getDataUrlFromFile(compressed)
  return { dataUrl, width: maxSize, height: maxSize }
}

/**
 * 🎨 Оптимизирует изображение перед загрузкой
 *
 * Использует browser-image-compression для:
 * - Сжатия до ≤150KB / 1200px
 * - Конвертации в WebP
 * - Параллельной генерации LQIP blur placeholder
 */
export async function optimizeImageBeforeUpload(
  file: File,
): Promise<OptimizationResult> {
  const originalSize = file.size

  const maxDim = OPTIMIZATION_RECOMMENDATIONS.RECOMMENDED_UPLOAD_DIMENSIONS.width

  // Параллельно: основное сжатие + LQIP
  const [compressed, blurResult] = await Promise.all([
    imageCompression(file, {
      maxSizeMB: 0.15,
      maxWidthOrHeight: maxDim,
      useWebWorker: true,
      fileType: 'image/webp',
    }),
    generateBlurPlaceholder(file).catch(() => null),
  ])

  // Переименовываем в .webp (library не всегда меняет имя)
  const webpFile = new File(
    [compressed],
    file.name.replace(/\.[^.]+$/, '.webp'),
    { type: 'image/webp' },
  )

  return {
    file: webpFile,
    originalSize,
    optimizedSize: webpFile.size,
    savings: Math.max(0, ((originalSize - webpFile.size) / originalSize) * 100),
    blurPlaceholder: blurResult?.dataUrl,
  }
}

/**
 * 📊 Валидация файла изображения
 */
export function validateImageFile(file: File): {
  isValid: boolean
  error?: string
} {
  if (!file.type.startsWith('image/')) {
    return {
      isValid: false,
      error: 'Файл должен быть изображением',
    }
  }

  const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!supportedFormats.includes(file.type)) {
    return {
      isValid: false,
      error: `Формат ${file.type} не поддерживается. Используйте: JPEG, PNG, WebP`,
    }
  }

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
 */
export async function optimizeImagesBatch(
  files: File[],
  onProgress?: (current: number, total: number) => void,
): Promise<OptimizationResult[]> {
  const results: OptimizationResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (!file) {
      console.warn(`File at index ${i} is undefined, skipping`)
      continue
    }

    try {
      const result = await optimizeImageBeforeUpload(file)
      results.push(result)
    }
    catch (error) {
      console.error(`Failed to optimize ${file.name}:`, error)
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
