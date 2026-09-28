import type { OptimizationResult } from './imageOptimizer'

/**
 * Сжатие фото перед загрузкой — модуль сжатия подгружается в момент вызова.
 *
 * Зачем (28 сентября 2026). `imageOptimizer.ts` тянет `browser-image-compression`:
 * 53 КБ, 21 КБ в gzip, 14–20 мс процессора телефона на разбор. Отзывы
 * импортировали его статически — стор, форма на карточке товара и форма в
 * заказе, — и библиотека приезжала с каждой карточкой, хотя фото к отзыву
 * прикладывают единицы. Теперь она грузится, только когда человек выбрал файл.
 *
 * `null` — сжимать не нужно: на платном тарифе Supabase сжимает сам.
 */
export async function optimizeForUpload(file: File): Promise<OptimizationResult | null> {
  const { optimizeImageBeforeUpload, shouldOptimizeImage } = await import('./imageOptimizer')
  return shouldOptimizeImage(file) ? optimizeImageBeforeUpload(file) : null
}
