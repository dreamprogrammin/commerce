import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

/**
 * В `product_images.image_url` лежит путь БЕЗ расширения, и файла по нему в
 * бакете нет — загружены только варианты `_sm/_md/_lg.webp`. Значит публичная
 * ссылка от голого пути отдаёт 400, и на её месте у покупателя пустая заглушка.
 *
 * Так уже дважды: в списке заказов и в админской кассе. Поэтому проверяем не
 * конкретный файл, а весь класс ошибки — картинки товара обязаны адресоваться
 * через `getVariantUrl`, который сам подставит суффикс варианта.
 *
 * Проверка идёт по исходникам: обе разметки требуют живого Nuxt-окружения с
 * supabase-клиентом, поднимать его ради одной строки дороже, чем прочитать файл.
 */
const ROOTS = ['pages', 'components']

/** Голый public URL для бакета товаров — мимо вариантов. */
const FORBIDDEN = [
  // getPublicUrl(BUCKET_NAME_PRODUCT, ...)
  /getPublicUrl\(\s*BUCKET_NAME_PRODUCT/,
  // storage.from('product-images').getPublicUrl(...)
  /from\(\s*['"]product-images['"]\s*\)\s*\.getPublicUrl\(/,
]

function collectVueFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      collectVueFiles(full, acc)
    else if (entry.endsWith('.vue'))
      acc.push(full)
  }
  return acc
}

describe('ссылки на картинки товара', () => {
  it('строятся через getVariantUrl, а не от голого пути', () => {
    const root = process.cwd()
    const offenders: string[] = []

    for (const dir of ROOTS) {
      for (const file of collectVueFiles(resolve(root, dir))) {
        const source = readFileSync(file, 'utf8')
        if (FORBIDDEN.some(pattern => pattern.test(source)))
          offenders.push(relative(root, file))
      }
    }

    expect(offenders, 'публичная ссылка от голого пути отдаёт 400').toEqual([])
  })
})
