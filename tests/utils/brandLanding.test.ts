import { describe, expect, it } from 'vitest'
import {
  brandLandingPairKey,
  buildBrandLandingPath,
  countProductsByCategoryBrand,
  isBrandLandingIndexable,
  parseCatalogSlug,
} from '@/utils/brandLanding'

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

  /*
   * Смена бренда прямо на бренд-лендинге.
   *
   * `CategoryBrands` строит ссылки от текущего пути (`route.path`), а на
   * бренд-лендинге там уже есть хвост `/brand/<слаг>`. Без защиты получалось
   * `/catalog/boys/brand/mattel/brand/hstar` — на проде это 404 на КАЖДОМ
   * чипе бренда, и Nuxt ещё и префетчил под них `_payload.json`.
   */
  it('не удваивает хвост, если он уже есть в пути', () => {
    expect(buildBrandLandingPath('/catalog/boys/brand/mattel', 'hstar'))
      .toBe('/catalog/boys/brand/hstar')
  })

  it('тот же бренд на бренд-лендинге даёт тот же путь, а не вложенный', () => {
    expect(buildBrandLandingPath('/catalog/boys/brand/mattel', 'mattel'))
      .toBe('/catalog/boys/brand/mattel')
  })

  it('вложенная категория с хвостом тоже разбирается верно', () => {
    expect(buildBrandLandingPath('/catalog/girls/kukly/brand/barbie/', 'lol'))
      .toBe('/catalog/girls/kukly/brand/lol')
  })

  /*
   * Категория со слагом `brand` — не хвост бренд-лендинга. Одинокий `brand`
   * в конце пути трогать нельзя, иначе сломается обычная категория.
   */
  it('одинокий сегмент brand в конце не считается хвостом', () => {
    expect(buildBrandLandingPath('/catalog/brand', 'mattel'))
      .toBe('/catalog/brand/brand/mattel')
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

/*
 * Дерево из боевых данных, ужатое до нужного:
 *
 *   mashinki
 *     └── radioupravlyaemye-mashinki   ← все девять товаров mokatoys лежат тут
 *   avtotreki                          ← товаров нет вовсе
 */
const categories = [
  { id: 'mashinki', parent_id: null },
  { id: 'rc-mashinki', parent_id: 'mashinki' },
  { id: 'avtotreki', parent_id: null },
]

describe('countProductsByCategoryBrand', () => {
  it('товар засчитывается и своей категории, и всем её родителям', () => {
    const counts = countProductsByCategoryBrand(
      [
        { category_id: 'rc-mashinki', brand_id: 'mokatoys' },
        { category_id: 'rc-mashinki', brand_id: 'mokatoys' },
        { category_id: 'rc-mashinki', brand_id: 'mokatoys' },
      ],
      categories,
    )

    expect(counts.get(brandLandingPairKey('rc-mashinki', 'mokatoys'))).toBe(3)
    /*
     * Ради этой строки всё и затевалось: на родительской категории товаров
     * нет ни одного, но страница `/catalog/mashinki/brand/mokatoys` покажет
     * все три — `get_filtered_products` разворачивает категорию в потомков.
     * Прямой подсчёт `p.category_id = c.id` вернул бы здесь undefined.
     */
    expect(counts.get(brandLandingPairKey('mashinki', 'mokatoys'))).toBe(3)
  })

  it('пары без товаров в таблице не появляются', () => {
    const counts = countProductsByCategoryBrand(
      [{ category_id: 'rc-mashinki', brand_id: 'mokatoys' }],
      categories,
    )

    expect(counts.get(brandLandingPairKey('avtotreki', 'soba'))).toBeUndefined()
  })

  it('товары без категории или без бренда не считаются', () => {
    const counts = countProductsByCategoryBrand(
      [
        { category_id: null, brand_id: 'mokatoys' },
        { category_id: 'rc-mashinki', brand_id: null },
      ],
      categories,
    )

    expect(counts.size).toBe(0)
  })

  it('петля в parent_id не вешает подсчёт', () => {
    const counts = countProductsByCategoryBrand(
      [{ category_id: 'a', brand_id: 'b' }],
      [
        { id: 'a', parent_id: 'b-cat' },
        { id: 'b-cat', parent_id: 'a' },
      ],
    )

    expect(counts.get(brandLandingPairKey('a', 'b'))).toBe(1)
    expect(counts.get(brandLandingPairKey('b-cat', 'b'))).toBe(1)
  })
})

describe('isBrandLandingIndexable', () => {
  /*
   * Боевая ситуация на 2 сентября 2026: у пары `avtotreki + soba` есть строка
   * в `category_brand_seo` (значит, до правки страница отдавала
   * `index, follow` и лежала в карте сайта), а товаров у неё ноль.
   */
  it('пустой лендинг закрыт', () => {
    expect(isBrandLandingIndexable(0)).toBe(false)
  })

  it('один-два товара — всё ещё закрыт', () => {
    expect(isBrandLandingIndexable(1)).toBe(false)
    expect(isBrandLandingIndexable(2)).toBe(false)
  })

  it('с порога и выше — открыт', () => {
    expect(isBrandLandingIndexable(3)).toBe(true)
    expect(isBrandLandingIndexable(14)).toBe(true)
  })

  /*
   * Неизвестное число — это сбой запроса или незавершённая загрузка. Закрывать
   * из-за него рабочую страницу нельзя: разовая ошибка базы раздалась бы как
   * `noindex` всем, включая робота, и держалась бы до следующего обхода.
   */
  it('неизвестное число товаров не закрывает страницу', () => {
    expect(isBrandLandingIndexable(null)).toBe(true)
    expect(isBrandLandingIndexable(undefined)).toBe(true)
  })
})
