/**
 * 🎨 КОНФИГУРАЦИЯ ИЗОБРАЖЕНИЙ
 * Централизованное управление оптимизацией и параметрами изображений
 */

// 🎛️ ГЛАВНЫЙ ПЕРЕКЛЮЧАТЕЛЬ
// Установите false если закончились деньги на Supabase Image Transformation
// или возникли проблемы с оптимизацией
export const IMAGE_OPTIMIZATION_ENABLED = false

// 📊 ПРИЧИНЫ ДЛЯ ОТКЛЮЧЕНИЯ:
// - Закончился бюджет на Supabase
// - Проблемы с производительностью Image Transformation API
// - Отладка (сравнение оригиналов vs оптимизированных)
// - Миграция на другой сервис

// 🎯 ПРЕДУСТАНОВЛЕННЫЕ РАЗМЕРЫ
export const IMAGE_SIZES = {
  // Карточки товаров
  PRODUCT_CARD: {
    width: 400,
    height: 400,
    quality: 80,
    format: 'webp' as const,
  },

  // Галерея товара
  PRODUCT_GALLERY_MAIN: {
    width: 800,
    height: 800,
    quality: 85,
    format: 'webp' as const,
  },

  PRODUCT_GALLERY_THUMB: {
    width: 150,
    height: 150,
    quality: 80,
    format: 'webp' as const,
  },

  // Слайдер на главной
  SLIDER_BANNER: {
    width: 1920,
    height: 800,
    quality: 85,
    format: 'webp' as const,
  },

  // Категории
  CATEGORY_IMAGE: {
    width: 300,
    height: 200,
    quality: 85,
    format: 'webp' as const,
  },

  // Аватары пользователей
  USER_AVATAR: {
    width: 200,
    height: 200,
    quality: 80,
    format: 'webp' as const,
  },

  // Миниатюры для списков
  THUMBNAIL: {
    width: 100,
    height: 100,
    quality: 75,
    format: 'webp' as const,
  },
} as const

// 📝 КАЧЕСТВО ПО УМОЛЧАНИЮ
export const DEFAULT_IMAGE_QUALITY = 80
export const DEFAULT_IMAGE_FORMAT = 'webp' as const

// 🔧 ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ

/**
 * Проверяет, включена ли оптимизация
 */
export function isOptimizationEnabled(): boolean {
  return IMAGE_OPTIMIZATION_ENABLED
}

/**
 * Получить предустановку размера
 */
export function getImageSize(preset: keyof typeof IMAGE_SIZES) {
  return IMAGE_SIZES[preset]
}

/**
 * Логирование статуса оптимизации (для отладки)
 */
export function logOptimizationStatus() {
  if (import.meta.client) {
    console.warn(
      `🎨 Image Optimization: ${IMAGE_OPTIMIZATION_ENABLED ? '✅ Enabled' : '⚠️ Disabled (using original URLs)'}`,
    )
  }
}
