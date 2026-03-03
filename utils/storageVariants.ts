import { IMAGE_VARIANTS, IMAGE_VARIANTS_WIDE } from '@/config/images'

/**
 * Проверяет, является ли путь legacy-форматом (с расширением файла)
 */
export function isLegacyImagePath(url: string): boolean {
  return /\.\w{3,4}$/.test(url)
}

/**
 * Возвращает массив путей всех вариантов для стандартных изображений (товары)
 * Для legacy-путей (с расширением) возвращает только сам путь
 */
export function getVariantPaths(basePath: string): string[] {
  if (isLegacyImagePath(basePath)) {
    return [basePath]
  }
  return Object.values(IMAGE_VARIANTS).map(v => `${basePath}${v.suffix}.webp`)
}

/**
 * Возвращает массив путей всех вариантов для широких изображений (баннеры, слайды)
 * Для legacy-путей (с расширением) возвращает только сам путь
 */
export function getVariantPathsWide(basePath: string): string[] {
  if (isLegacyImagePath(basePath)) {
    return [basePath]
  }
  return Object.values(IMAGE_VARIANTS_WIDE).map(v => `${basePath}${v.suffix}.webp`)
}
