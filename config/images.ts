/**
 * 🎯 Конфигурация стратегии оптимизации изображений
 *
 * Это главный переключатель для всей системы!
 *
 * Изменение этого флага меняет ВСЮ архитектуру:
 * - false (сейчас) = локальная оптимизация через Canvas
 * - true (будущее) = облачная трансформация через Supabase
 */

/**
 * 🎛️ ГЛАВНЫЙ ПЕРЕКЛЮЧАТЕЛЬ
 *
 * false = 💾 Бесплатный тариф Supabase (IMAGE_TRANSFORMATION_LITE не включена)
 *   - Оптимизируем локально через Canvas (WebP, 800x800, 85%)
 *   - Загружаем оптимизированные файлы в Supabase
 *   - Экономим ~93% трафика
 *   - Подходит при ограниченном трафике
 *
 * true = 🚀 Платный тариф Supabase (IMAGE_TRANSFORMATION_LITE или IMAGE_TRANSFORMATION_STANDARD)
 *   - Загружаем оригиналы любого размера
 *   - Supabase оптимизирует на лету при запросе
 *   - Более гибкий формат (AVIF, JPEG, PNG)
 *   - Подходит при большом количестве вариантов размеров
 *
 * @example
 * // Проверяем режим в компоненте
 * import { IMAGE_OPTIMIZATION_ENABLED } from '@/config/images'
 *
 * if (IMAGE_OPTIMIZATION_ENABLED) {
 *   // Используем облачные преобразования
 * } else {
 *   // Используем локальную оптимизацию
 * }
 */
export const IMAGE_OPTIMIZATION_ENABLED = true

/**
 * 📏 Размеры изображений для разных сценариев
 *
 * Используются при трансформации (когда IMAGE_OPTIMIZATION_ENABLED = true)
 * На бесплатном тарифе - просто справочная информация
 */
export const IMAGE_SIZES = {
  /**
   * Миниатюры в списках, поиске, фильтрах
   * Используется: GridView, ProductList, SearchResults
   */
  THUMBNAIL: {
    width: 200,
    height: 200,
  },

  /**
   * Карточки товаров на главной, в каталоге
   * Используется: ProductCard, CategoryCard
   */
  CARD: {
    width: 400,
    height: 400,
  },

  /**
   * Карточка товара в сетке (синоним CARD для совместимости)
   * Используется: ProductCard компонент
   */
  PRODUCT_CARD: {
    width: 400,
    height: 400,
  },

  /**
   * Полная версия в модальном окне, слайдере
   * Используется: ProductModal, ImageGallery, Lightbox
   */
  FULL: {
    width: 800,
    height: 800,
  },

  /**
   * Для администраторской панели
   * Используется: AdminProductForm, AdminGallery
   */
  ADMIN: {
    width: 600,
    height: 600,
  },

  /**
   * Для превью в соцсетях (og:image)
   * Используется: Meta tags, Social sharing
   */
  SOCIAL: {
    width: 1200,
    height: 630,
  },

  /**
   * Для шапки страницы (hero section)
   * Используется: HeroImage, Banner
   */
  HERO: {
    width: 1920,
    height: 500,
  },

  /**
   * Для слайдера/карусели баннеров
   * Используется: SlidesCarousel, BannerSlider
   */
  SLIDER_BANNER: {
    width: 1920,
    height: 600,
  },
}

/**
 * ⚙️ Параметры локальной оптимизации
 *
 * Используются в imageOptimizer.ts когда IMAGE_OPTIMIZATION_ENABLED = false
 */
export const OPTIMIZATION_OPTIONS = {
  /**
   * Максимальный размер по ширине/высоте (px)
   * Изображение масштабируется сохраняя пропорции
   */
  maxWidth: 800,
  maxHeight: 800,

  /**
   * Качество сжатия (0.0 - 1.0)
   * 0.85 = хороший баланс между качеством и размером
   * 0.95 = выше качество, больше размер
   * 0.75 = меньше качество, меньше размер
   */
  quality: 0.85,

  /**
   * Формат вывода
   * webp = лучшее сжатие, поддерживается всеми браузерами
   * jpeg = хороший баланс, максимальная совместимость
   * png = для изображений с прозрачностью
   */
  format: 'webp' as const,
}

/**
 * 📊 Параметры облачной трансформации
 *
 * Используются в useSupabaseStorage.ts когда IMAGE_OPTIMIZATION_ENABLED = true
 */
export const CLOUD_TRANSFORM_OPTIONS = {
  /**
   * Качество для облачной трансформации
   * Supabase рекомендует 75-85 для оптимального баланса
   */
  quality: 80,

  /**
   * Формат трансформации
   * webp = лучший выбор для веба (95% поддержка)
   * avif = самый современный (меньший размер, но хуже поддержка)
   */
  format: 'webp' as const,

  /**
   * Режим изменения размера
   * cover = заполняет контейнер, может обрезать (по умолчанию)
   * contain = вмещает полностью, может быть пустота
   * fill = растягивает, может исказить пропорции
   */
  resize: 'cover' as const,
}

/**
 * 🎯 Размер файла для триггера оптимизации
 *
 * Если файл больше этого размера - будет оптимизирован
 * На бесплатном тарифе (IMAGE_OPTIMIZATION_ENABLED = false)
 *
 * По умолчанию: 500 KB
 * - меньше 500 KB → загружаем как есть
 * - больше 500 KB → оптимизируем через Canvas
 */
export const OPTIMIZATION_THRESHOLD = 500 * 1024 // 500 KB

/**
 * 🔄 Параметры кеширования
 *
 * Используются в useSupabaseStorage.ts для контроля кеша браузера
 */
export const CACHE_CONFIG = {
  /**
   * Время жизни кеша в секундах (Cache-Control header)
   * 3600 = 1 час (по умолчанию)
   * 86400 = 1 день (для редко меняющихся изображений)
   * 31536000 = 1 год (для хешированных имен)
   */
  cacheControl: '3600',

  /**
   * Кеширование на стороне браузера (локальный кеш)
   * true = кешируем, браузер переиспользует
   * false = всегда переза́грузим
   */
  enableBrowserCache: true,

  /**
   * Кеширование в памяти приложения (RAM)
   * true = кешируем URLs в Map<string, string>
   * false = пересчитываем каждый раз
   */
  enableMemoryCache: true,

  /**
   * Максимальный размер memory cache (количество entries)
   * Если превышено - очищаем старые
   */
  maxMemoryCacheSize: 500,
}

/**
 * 🌐 CDN настройки
 *
 * Для использования с собственным CDN (вместо Supabase)
 */
export const CDN_CONFIG = {
  /**
   * Использовать собственный CDN для изображений
   * false = используем Supabase Storage (по умолчанию)
   * true = используем внешний CDN
   */
  enabled: false,

  /**
   * URL базы CDN
   * @example 'https://cdn.yourdomain.com'
   */
  baseUrl: '',

  /**
   * Параметр для кеширования (bust cache)
   * Например: ?v=1.2.3 или ?t=123456789
   */
  cacheBustParam: 't',
}

/**
 * 📱 Адаптивные размеры для разных экранов
 *
 * Используются если нужны разные размеры для mobile/tablet/desktop
 */
export const RESPONSIVE_IMAGE_SIZES = {
  mobile: {
    THUMBNAIL: { width: 150, height: 150 },
    CARD: { width: 300, height: 300 },
  },
  tablet: {
    THUMBNAIL: { width: 200, height: 200 },
    CARD: { width: 400, height: 400 },
  },
  desktop: {
    THUMBNAIL: { width: 300, height: 300 },
    CARD: { width: 600, height: 600 },
  },
}

/**
 * 🔍 Форматы для разных браузеров
 *
 * Используется для srcset с fallback
 */
export const IMAGE_FORMATS = {
  /**
   * Современные браузеры (Chrome 86+, Firefox 80+, Safari 16+)
   * AVIF = самый новый, самый маленький
   */
  modern: 'avif' as const,

  /**
   * Базовый формат (все браузеры)
   * WebP = хороший баланс, поддерживается везде
   */
  fallback: 'webp' as const,

  /**
   * Старые браузеры
   * JPEG = максимальная совместимость
   */
  legacy: 'jpeg' as const,
}

/**
 * 🎨 Цвета плейсхолдеров
 *
 * Используются в ProgressiveImage.vue для разных категорий
 */
export const PLACEHOLDER_COLORS = {
  default: 'from-muted via-muted/70 to-muted',
  product: 'from-slate-200 via-slate-100 to-slate-200',
  category: 'from-blue-200 via-blue-100 to-blue-200',
  brand: 'from-purple-200 via-purple-100 to-purple-200',
  hero: 'from-gray-300 via-gray-200 to-gray-300',
}

/**
 * 🛠️ Вспомогательная функция для построения URL с трансформацией
 *
 * Используется в useSupabaseStorage.ts
 * Автоматически проверяет IMAGE_OPTIMIZATION_ENABLED
 *
 * @param baseUrl - базовый URL изображения
 * @param size - размеры для трансформации
 * @returns готовый URL с параметрами или оригинальный URL
 *
 * @example
 * const url = getOptimizedImageUrl(
 *   'https://project.supabase.co/storage/v1/object/public/products/image.jpg',
 *   IMAGE_SIZES.CARD
 * )
 */
export function getOptimizedImageUrl(
  baseUrl: string,
  size: { width: number, height: number } = IMAGE_SIZES.CARD,
): string {
  if (!IMAGE_OPTIMIZATION_ENABLED) {
    // 💾 Бесплатный тариф - возвращаем оригинал
    return baseUrl
  }

  // 🚀 Платный тариф - добавляем параметры трансформации
  const params = new URLSearchParams({
    width: size.width.toString(),
    height: size.height.toString(),
    quality: CLOUD_TRANSFORM_OPTIONS.quality.toString(),
    format: CLOUD_TRANSFORM_OPTIONS.format,
    mode: CLOUD_TRANSFORM_OPTIONS.resize,
  })

  return `${baseUrl}?${params.toString()}`
}

/**
 * 📋 Получить размер для конкретного экрана
 *
 * @param breakpoint - 'mobile' | 'tablet' | 'desktop'
 * @param type - 'THUMBNAIL' | 'CARD' | 'FULL' | 'ADMIN'
 * @returns размеры { width, height }
 *
 * @example
 * const size = getResponsiveSize('mobile', 'CARD')
 * // { width: 300, height: 300 }
 */
export function getResponsiveSize(
  breakpoint: 'mobile' | 'tablet' | 'desktop',
  type: keyof typeof IMAGE_SIZES,
): { width: number, height: number } {
  return RESPONSIVE_IMAGE_SIZES[breakpoint][type as keyof typeof RESPONSIVE_IMAGE_SIZES.mobile]
    || IMAGE_SIZES[type]
}

/**
 * 🎭 Получить цвет плейсхолдера для категории
 *
 * @param category - тип категории
 * @returns строка с градиентом
 *
 * @example
 * const color = getPlaceholderColor('product')
 * // 'from-slate-200 via-slate-100 to-slate-200'
 */
export function getPlaceholderColor(
  category: keyof typeof PLACEHOLDER_COLORS = 'default',
): string {
  return PLACEHOLDER_COLORS[category] || PLACEHOLDER_COLORS.default
}

/**
 * 📊 Получить инфо о текущем режиме
 *
 * Используется для отладки и логирования
 *
 * @returns объект с информацией о режиме
 *
 * @example
 * console.log(getOptimizationMode())
 * // {
 * //   enabled: false,
 * //   mode: 'Pre-optimized',
 * //   icon: '💾',
 * //   description: 'Локальная оптимизация через Canvas'
 * // }
 */
export function getOptimizationMode() {
  return {
    enabled: IMAGE_OPTIMIZATION_ENABLED,
    mode: IMAGE_OPTIMIZATION_ENABLED ? 'Supabase Transform' : 'Pre-optimized',
    icon: IMAGE_OPTIMIZATION_ENABLED ? '🚀' : '💾',
    description: IMAGE_OPTIMIZATION_ENABLED
      ? 'Облачная трансформация через Supabase Image Transformation API'
      : 'Локальная оптимизация через Canvas (WebP 800x800 85%)',
    threshold: OPTIMIZATION_THRESHOLD,
    quality: IMAGE_OPTIMIZATION_ENABLED ? CLOUD_TRANSFORM_OPTIONS.quality : OPTIMIZATION_OPTIONS.quality,
    format: IMAGE_OPTIMIZATION_ENABLED ? CLOUD_TRANSFORM_OPTIONS.format : OPTIMIZATION_OPTIONS.format,
  }
}

// ===== ЭКСПОРТ ВСЕГО =====
export default {
  IMAGE_OPTIMIZATION_ENABLED,
  IMAGE_SIZES,
  OPTIMIZATION_OPTIONS,
  CLOUD_TRANSFORM_OPTIONS,
  OPTIMIZATION_THRESHOLD,
  CACHE_CONFIG,
  CDN_CONFIG,
  RESPONSIVE_IMAGE_SIZES,
  IMAGE_FORMATS,
  PLACEHOLDER_COLORS,
  getOptimizedImageUrl,
  getResponsiveSize,
  getPlaceholderColor,
  getOptimizationMode,
}
