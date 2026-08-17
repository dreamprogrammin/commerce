import { describe, expect, it } from 'vitest'
import { buildBrandLandingPath, parseCatalogSlug } from '@/utils/brandLanding'

describe('parseCatalogSlug', () => {
  it('обычная категория — бренда нет', () => {
    expect(parseCatalogSlug(['boys'])).toEqual({
      categorySegments: ['boys'],
      brandSlug: null,
    })
  })

  it('вложенная категория — бренда нет', () => {
    expect(parseCatalogSlug(['girls', 'kukly'])).toEqual({
      categorySegments: ['girls', 'kukly'],
      brandSlug: null,
    })
  })

  it('бренд-лендинг: категория и бренд разделяются', () => {
    expect(parseCatalogSlug(['boys', 'brand', 'mattel'])).toEqual({
      categorySegments: ['boys'],
      brandSlug: 'mattel',
    })
  })

  it('бренд-лендинг под вложенной категорией', () => {
    expect(parseCatalogSlug(['constructors-root', 'konstruktory-malchikam', 'brand', 'lego'])).toEqual({
      categorySegments: ['constructors-root', 'konstruktory-malchikam'],
      brandSlug: 'lego',
    })
  })

  /*
   * Одинокий `brand` в конце — это категория со слагом `brand`, а не половина
   * бренд-лендинга. Иначе такой адрес молча превратился бы в бренд-лендинг без
   * бренда и отдал бы всю категорию под чужим заголовком.
   */
  it('одинокий сегмент brand считается категорией', () => {
    expect(parseCatalogSlug(['boys', 'brand'])).toEqual({
      categorySegments: ['boys', 'brand'],
      brandSlug: null,
    })
  })

  it('пустой и отсутствующий ввод', () => {
    for (const input of [[], null, undefined]) {
      expect(parseCatalogSlug(input)).toEqual({ categorySegments: [], brandSlug: null })
    }
  })
})

describe('buildBrandLandingPath', () => {
  it('склеивает путь категории со слагом бренда', () => {
    expect(buildBrandLandingPath('/catalog/boys', 'mattel')).toBe('/catalog/boys/brand/mattel')
  })

  it('хвостовой слеш не удваивается', () => {
    expect(buildBrandLandingPath('/catalog/boys/', 'mattel')).toBe('/catalog/boys/brand/mattel')
  })

  /* Собранный путь обязан разбираться обратно — иначе ссылка ведёт в 404. */
  it('обратим: что собрали, то и разбирается', () => {
    const path = buildBrandLandingPath('/catalog/girls/kukly', 'barbie')
    const segments = path.replace('/catalog/', '').split('/')
    expect(parseCatalogSlug(segments)).toEqual({
      categorySegments: ['girls', 'kukly'],
      brandSlug: 'barbie',
    })
  })
})
