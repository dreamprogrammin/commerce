/**
 * 🎯 УНИВЕРСАЛЬНАЯ КОНФИГУРАЦИЯ ИЗОБРАЖЕНИЙ
 *
 * Просто измените IMAGE_OPTIMIZATION_ENABLED на true
 * когда перейдете на платный тариф Supabase!
 */

/**
 * 🔧 ГЛАВНЫЙ ПЕРЕКЛЮЧАТЕЛЬ
 *
 * false = БЕСПЛАТНЫЙ ТАРИФ:
 *   - Использует API proxy для обхода Cloudflare
 *   - Загружает оригинальные изображения (предварительно оптимизированные)
 *   - Без трансформаций на лету
 *
 * true = ПЛАТНЫЙ ТАРИФ:
 *   - Использует Supabase Image Transformation API
 *   - Трансформация на лету (resize, format, quality)
 *   - Автоматический WebP/AVIF
 */
export const IMAGE_OPTIMIZATION_ENABLED = false // 🎯 false = бесплатный (прямые ссылки), true = платный (render API)

/**
 * 📐 Размеры изображений для разных контекстов
 */
export const IMAGE_SIZES = {
  // Карточки товаров в каталоге
  CARD: {
    width: 400,
    height: 400,
  },

  // Thumbnail для галереи
  THUMBNAIL: {
    width: 100,
    height: 100,
  },

  // Детальная страница товара
  DETAIL: {
    width: 800,
    height: 800,
  },

  // 🆕 Large изображения (для OG Image, зума, высокого качества)
  LARGE: {
    width: 1200,
    height: 1200,
  },

  // Hero изображения
  HERO: {
    width: 1200,
    height: 600,
  },

  // Слайдер баннеров на главной
  SLIDER_BANNER: {
    width: 1920,
    height: 600,
  },

  // Баннеры на главной (после слайдера)
  BANNER: {
    width: 1200,
    height: 400,
  },

  // Мобильные версии
  MOBILE: {
    width: 640,
    height: 640,
  },

  CATEGORY_MENU: {
    width: 250,
    height: 150,
  },

  // Галерея товара - миниатюры
  PRODUCT_GALLERY_THUMB: {
    width: 120,
    height: 120,
  },

  // Галерея товара - основное изображение
  PRODUCT_GALLERY_MAIN: {
    width: 800,
    height: 800,
  },

  // 🆕 OG Image (Open Graph для соцсетей)
  OG_IMAGE: {
    width: 1200,
    height: 630, // Стандарт для OG изображений
  },
} as const

/**
 * 🎨 Качество изображений
 */
export const IMAGE_QUALITY = {
  LOW: 60, // Для preview/thumbnails
  MEDIUM: 75, // Для обычных карточек
  HIGH: 85, // Для детальных страниц
  ORIGINAL: 95, // Для зума/печати
} as const

/**
 * 📦 Форматы изображений (по приоритету)
 */
export const IMAGE_FORMATS = {
  MODERN: 'webp' as const, // Основной формат
  FALLBACK: 'jpeg' as const, // Fallback для старых браузеров
  NEXTGEN: 'avif' as const, // Для будущего (меньше размер)
} as const

/**
 * ⚙️ Настройки оптимизации
 */
export const OPTIMIZATION_CONFIG = {
  // Lazy loading
  LAZY_LOAD: {
    rootMargin: '200px', // Начинать загрузку за 200px до появления
    threshold: 0.01, // Срабатывать при 1% видимости
  },

  // Debounce для быстрого переключения (карусель)
  DEBOUNCE_MS: 150,

  // Retry при ошибках
  MAX_RETRIES: 1,
  RETRY_DELAY_MS: 500,

  // Кеширование
  CACHE_MAX_AGE: 31536000, // 1 год в секундах

  // Preload для критичных изображений
  PRELOAD_CRITICAL: true,
} as const

/**
 * 🛡️ Настройки кеширования
 */
export const CACHE_CONFIG = {
  // Кеш в браузере
  MAX_AGE_SECONDS: 31536000, // 1 год

  // Debounce для карусели
  DEBOUNCE_MS: 150,
} as const

/**
 * 🎯 Пресеты для разных сценариев
 */
export const IMAGE_PRESETS = {
  // Карточка товара в каталоге
  PRODUCT_CARD: {
    ...IMAGE_SIZES.CARD,
    quality: IMAGE_QUALITY.MEDIUM,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // Галерея на детальной странице
  PRODUCT_GALLERY: {
    ...IMAGE_SIZES.DETAIL,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'contain' as const,
  },

  // Thumbnail для галереи
  PRODUCT_THUMBNAIL: {
    ...IMAGE_SIZES.THUMBNAIL,
    quality: IMAGE_QUALITY.LOW,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // 🆕 Large изображения (для зума, OG Image)
  LARGE: {
    ...IMAGE_SIZES.LARGE,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'contain' as const,
  },

  // 🆕 OG Image для соцсетей
  OG_IMAGE: {
    ...IMAGE_SIZES.OG_IMAGE,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.FALLBACK, // JPEG для лучшей совместимости
    resize: 'cover' as const,
  },

  // Галерея товара - миниатюры (боковая панель)
  PRODUCT_GALLERY_THUMB: {
    ...IMAGE_SIZES.PRODUCT_GALLERY_THUMB,
    quality: IMAGE_QUALITY.MEDIUM,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // Галерея товара - основное изображение
  PRODUCT_GALLERY_MAIN: {
    ...IMAGE_SIZES.PRODUCT_GALLERY_MAIN,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'contain' as const,
  },

  // Hero баннер
  HERO_BANNER: {
    ...IMAGE_SIZES.HERO,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // Слайдер баннер
  SLIDER_BANNER: {
    ...IMAGE_SIZES.SLIDER_BANNER,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // Баннер
  BANNER: {
    ...IMAGE_SIZES.BANNER,
    quality: IMAGE_QUALITY.HIGH,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  // Мобильная версия
  MOBILE_VIEW: {
    ...IMAGE_SIZES.MOBILE,
    quality: IMAGE_QUALITY.MEDIUM,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },

  CATEGORY_MENU: {
    ...IMAGE_SIZES.CATEGORY_MENU,
    quality: IMAGE_QUALITY.MEDIUM,
    format: IMAGE_FORMATS.MODERN,
    resize: 'cover' as const,
  },
} as const

/**
 * 📊 Рекомендации по оптимизации изображений
 */
export const OPTIMIZATION_RECOMMENDATIONS = {
  // Максимальный размер оригинала (для загрузки)
  MAX_ORIGINAL_SIZE_MB: 5,

  // Рекомендуемые размеры для загрузки
  RECOMMENDED_UPLOAD_DIMENSIONS: {
    width: 2000,
    height: 2000,
  },

  // Поддерживаемые форматы для загрузки
  SUPPORTED_UPLOAD_FORMATS: [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ] as const,
} as const

/**
 * 🎯 Получить информацию о текущем режиме оптимизации
 *
 * @returns объект с описанием текущего режима
 */
export function getOptimizationMode() {
  if (IMAGE_OPTIMIZATION_ENABLED) {
    return {
      mode: 'Платный',
      icon: '🚀',
      description: 'Supabase Transform (трансформация на лету)',
    }
  }

  return {
    mode: 'Бесплатный',
    icon: '💾',
    description: 'Локальная оптимизация при загрузке',
  }
}

/**
 * 🚀 ЭКСПОРТ ДЛЯ УДОБНОГО ИСПОЛЬЗОВАНИЯ
 */
export default {
  IMAGE_OPTIMIZATION_ENABLED,
  IMAGE_SIZES,
  IMAGE_QUALITY,
  IMAGE_FORMATS,
  OPTIMIZATION_CONFIG,
  CACHE_CONFIG,
  IMAGE_PRESETS,
  OPTIMIZATION_RECOMMENDATIONS,
  getOptimizationMode,
} as const
