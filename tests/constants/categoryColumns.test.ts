import { describe, expect, it } from 'vitest'
import { CATEGORY_PAGE_COLUMNS, PUBLIC_CATEGORY_COLUMNS } from '@/constants/categoryColumns'

/*
 * Общая выборка категорий уезжает в HTML каждой страницы сайта за всеми 65
 * категориями. Тяжёлые поля в ней стоили 42 КБ данных главной (замер
 * 13 октября 2026: 80 → 38 КБ). Страница раздела берёт их точечно для своей
 * категории — и потерять их там так же нельзя, как вернуть сюда.
 */

const columns = (list: string) => list.split(',').map(c => c.trim())

const HEAVY = [
  'description',
  'seo_text',
  'seo_title',
  'seo_keywords',
  'meta_title',
  'meta_description',
  'meta_keywords',
  'seo_description',
  'canonical_url',
  'og_title',
  'og_description',
  'og_image',
  'created_at',
  'updated_at',
  'blur_placeholder',
  'blur_data_url',
]

describe('колонки категорий', () => {
  it('в общей выборке нет тяжёлых полей', () => {
    expect(columns(PUBLIC_CATEGORY_COLUMNS).filter(c => HEAVY.includes(c))).toEqual([])
  })

  it('в общей выборке есть то, чем подписаны ссылки меню и подразделов', () => {
    expect(columns(PUBLIC_CATEGORY_COLUMNS)).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'href', 'parent_id', 'seo_h1', 'image_url']),
    )
  })

  it('страница раздела достаёт то, что читает у своей категории', () => {
    expect(columns(CATEGORY_PAGE_COLUMNS)).toEqual(expect.arrayContaining([
      'slug',
      'seo_text',
      'seo_title',
      'seo_keywords',
      'meta_title',
      'meta_description',
      'meta_keywords',
      'canonical_url',
    ]))
  })
})
