import fs from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Сжатие фото к отзыву — только по требованию.
 *
 * `utils/imageOptimizer.ts` тянет `browser-image-compression` (53 КБ, 21 КБ
 * в gzip). Отзывы импортировали его статически — стор, форма на карточке
 * товара и форма в заказе, — и библиотека грузилась и разбиралась с каждой
 * карточкой (14–20 мс процессора телефона, 28 сентября 2026), хотя фото
 * прикладывают единицы. Возврат статического импорта вернёт её обратно,
 * поэтому проверяется и способ, а не только результат.
 */

const optimizer = vi.hoisted(() => ({
  shouldOptimizeImage: vi.fn(),
  optimizeImageBeforeUpload: vi.fn(),
}))
vi.mock('../../utils/imageOptimizer', () => optimizer)

const REVIEW_MODULES = [
  'stores/publicStore/reviewsStore.ts',
  'components/product/ProductReviews.vue',
  'components/product/ReviewFormDialog.vue',
]

describe('optimizeForUpload', () => {
  beforeEach(() => {
    optimizer.shouldOptimizeImage.mockReset()
    optimizer.optimizeImageBeforeUpload.mockReset()
  })

  it('сжимает, когда нужно, и отдаёт результат сжатия', async () => {
    const { optimizeForUpload } = await import('../../utils/optimizeForUpload')
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    const result = { file: new File(['y'], 'photo.webp', { type: 'image/webp' }), originalSize: 1, optimizedSize: 1, savings: 0, blurPlaceholder: 'data:' }
    optimizer.shouldOptimizeImage.mockReturnValue(true)
    optimizer.optimizeImageBeforeUpload.mockResolvedValue(result)

    expect(await optimizeForUpload(file)).toBe(result)
    expect(optimizer.optimizeImageBeforeUpload).toHaveBeenCalledWith(file)
  })

  it('сжимать не нужно — null, библиотека не зовётся', async () => {
    const { optimizeForUpload } = await import('../../utils/optimizeForUpload')
    optimizer.shouldOptimizeImage.mockReturnValue(false)

    expect(await optimizeForUpload(new File(['x'], 'photo.jpg'))).toBeNull()
    expect(optimizer.optimizeImageBeforeUpload).not.toHaveBeenCalled()
  })

  it('отзывы не импортируют модуль сжатия статически', () => {
    for (const path of REVIEW_MODULES) {
      const source = fs.readFileSync(path, 'utf8')
      expect(source, path).not.toMatch(/^import (?!type\b)[^\n]*['"]@\/utils\/imageOptimizer['"]/m)
    }
    const helper = fs.readFileSync('utils/optimizeForUpload.ts', 'utf8')
    expect(helper).not.toMatch(/^import (?!type\b)[^\n]*['"]\.\/imageOptimizer['"]/m)
    expect(helper).toContain('await import(\'./imageOptimizer\')')
  })
})
