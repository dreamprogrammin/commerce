import { describe, expect, it } from 'vitest'
import { TILE_BLUR_LIMIT, toProductTiles } from '@/utils/productTiles'

function row(id: string) {
  return {
    id,
    product_images: [
      { id: `${id}-1`, image_url: 'a.webp', display_order: 0 },
      { id: `${id}-2`, image_url: 'b.webp', display_order: 1 },
    ],
    cover: [{ blur_placeholder: `data:${id}` }],
  }
}

describe('toProductTiles', () => {
  const tiles = toProductTiles(Array.from({ length: 6 }, (_, i) => row(`p${i}`)))

  it('превью — только у первого кадра первых карточек', () => {
    expect(tiles.map(t => t.product_images.map(i => i.blur_placeholder))).toEqual([
      ...Array.from({ length: TILE_BLUR_LIMIT }, (_, i) => [`data:p${i}`, null]),
      [null, null],
      [null, null],
    ])
  })

  it('служебное поле cover в плитку не попадает', () => {
    expect(tiles.every(t => !('cover' in t))).toBe(true)
  })

  it('товар без картинок — пустой список, не падение', () => {
    expect(toProductTiles([{ id: 'x', product_images: null, cover: null }])[0]!.product_images).toEqual([])
  })
})
