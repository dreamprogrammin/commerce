import { describe, expect, it, vi } from 'vitest'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'

/*
 * Почему этот файл появился.
 *
 * В базе пути к картинкам лежат БЕЗ расширения — во всех бакетах сразу:
 * `product_images.image_url`, `brands.logo_url`, `categories.image_url`,
 * `slides.image_url` (проверено на боевой базе 15 сентября 2026, 0 путей с
 * расширением из 690). На хранилище лежат только варианты: `…_sm.webp`,
 * `…_card.webp`, `…_md.webp`, `…_lg.webp`.
 *
 * Значит публичный URL по пути как есть ВСЕГДА битый — хранилище отвечает
 * 400. Именно так на бою оказались битыми картинки товаров в разметке
 * (починено отдельно) и миниатюры в заказе покупателя, в полосе активного
 * заказа на главной и в подборе товара для акции.
 */
const STORAGE = 'https://example.supabase.co/storage/v1/object/public'

vi.stubGlobal('useSupabaseClient', () => ({
  storage: {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE}/${bucket}/${path}` } }),
    }),
  },
}))
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { supabase: { url: 'https://example.supabase.co' } },
}))

const PATH = 'products/9d1/uhti-product-konstruktor-abc123'

describe('getImageUrl: путь без расширения', () => {
  it('отдаёт вариант, а не голый путь', () => {
    const { getImageUrl } = useSupabaseStorage()
    const url = getImageUrl('product-images', PATH)
    expect(url).toBe(`${STORAGE}/product-images/${PATH}_md.webp`)
  })

  it('размер из опций выбирает ближайший вариант', () => {
    const { getImageUrl } = useSupabaseStorage()
    expect(getImageUrl('product-images', PATH, IMAGE_SIZES.CARD)).toBe(
      `${STORAGE}/product-images/${PATH}_sm.webp`,
    )
    expect(getImageUrl('product-images', PATH, { width: 1200 })).toBe(
      `${STORAGE}/product-images/${PATH}_lg.webp`,
    )
    expect(getImageUrl('product-images', PATH, { width: 700 })).toBe(
      `${STORAGE}/product-images/${PATH}_md.webp`,
    )
  })

  it('работает с логотипами и категориями — там пути такие же', () => {
    const { getImageUrl } = useSupabaseStorage()
    expect(getImageUrl('brand-logos', 'uhti-brand-lego-880ff77d', { width: 120 })).toBe(
      `${STORAGE}/brand-logos/uhti-brand-lego-880ff77d_sm.webp`,
    )
  })
})

describe('getImageUrl: путь с расширением', () => {
  it('остаётся публичным URL как есть — это старый файл, вариантов у него нет', () => {
    const { getImageUrl } = useSupabaseStorage()
    const old = 'products/old/photo.jpg'
    expect(getImageUrl('product-images', old, IMAGE_SIZES.CARD)).toBe(
      `${STORAGE}/product-images/${old}`,
    )
  })

  it('пустой путь даёт null', () => {
    const { getImageUrl } = useSupabaseStorage()
    expect(getImageUrl('product-images', null)).toBeNull()
    expect(getImageUrl('product-images', '   ')).toBeNull()
  })
})

describe('getVariantUrl остаётся прежним', () => {
  it('подставляет запрошенный суффикс', () => {
    const { getVariantUrl } = useSupabaseStorage()
    expect(getVariantUrl('product-images', PATH, 'lg')).toBe(
      `${STORAGE}/product-images/${PATH}_lg.webp`,
    )
  })
})
