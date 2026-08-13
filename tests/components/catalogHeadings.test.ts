import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

/**
 * На /catalog в разметку уходили два <h1> с одинаковым текстом «Каталог»:
 * мобильный — видимый, в CatalogMobileSections, и десктопный — внутри
 * sticky-шапки, которую редизайн спрятал под sr-only.
 *
 * Прячет оба блока CSS (`lg:hidden` и `hidden lg:block`), а не v-if, поэтому
 * в SSR-HTML они присутствуют всегда, и краулер видел ровно два первых
 * заголовка на одной странице.
 *
 * Проверяем по исходникам, а не монтированием: обе страницы тянут за собой
 * сторы, TanStack Query и Supabase — поднимать это ради подсчёта тегов дороже,
 * чем прочитать файл. Тот же приём, что в footerLinks.test.ts.
 */
function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function countH1(source: string) {
  return (source.match(/<h1[\s>]/g) ?? []).length
}

describe('заголовки страницы /catalog', () => {
  it('в pages/catalog/index.vue нет ни одного <h1>', () => {
    expect(countH1(read('pages/catalog/index.vue'))).toBe(0)
  })

  it('единственный <h1> живёт в CatalogMobileSections', () => {
    expect(countH1(read('components/catalog/CatalogMobileSections.vue'))).toBe(1)
  })

  it('невидимая десктопная шапка отдаёт «Каталог» обычным текстом', () => {
    const source = read('pages/catalog/index.vue')
    expect(source).toMatch(/<p class="text-2xl font-bold">\s*Каталог\s*<\/p>/)
  })
})
