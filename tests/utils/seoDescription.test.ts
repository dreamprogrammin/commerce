import { describe, expect, it } from 'vitest'
import {
  clampDescription,
  composeCategoryMeta,
  META_DESCRIPTION_LIMIT,
  pluralRu,
} from '@/utils/seoDescription'

/**
 * Тексты взяты из прод-базы: ровно на них аудит 12 августа и поймал обрезку
 * посреди слова. Ожидаемые «до» — то, что реально отдавал сайт.
 */
const REAL = {
  boys: 'Машинки, роботы, супергерои, оружие и транспорт для мальчиков любого возраста. Широкий выбор, безопасные материалы. Быстрая доставка по всему Казахстану!',
  constructors:
    'Конструкторы для детей в Казахстане — широкий выбор, быстрая доставка в Алматы, Астану и другие города. Заказывайте в Ухтышка!',
  kiddy:
    'Игрушки для малышей — первые друзья и помощники в познании мира! 👶✨ Погремушки, прорезыватели, мобили, развивающие коврики и мягкие игрушки — всё создано специально для самых маленьких.',
}

const BRANDS = ['Hasbro', 'LEGO', 'Mattel']

/** Как выглядела прежняя сборка — для наглядности, что именно чинится. */
function legacyLead(text: string, brands: string[]): string {
  let out = text
  const sentenceEnd = out.search(/[.!?]\s/)
  if (sentenceEnd > 0 && sentenceEnd < 60)
    out = `${out.slice(0, sentenceEnd + 1)} (${brands.join(', ')})${out.slice(sentenceEnd + 1)}`
  else out = `${out.substring(0, 50)} (${brands.join(', ')})`

  if (out.length > 80) {
    const cut = out.lastIndexOf(' ', 80)
    out = cut > 50 ? out.substring(0, cut) : out.substring(0, 80)
  }
  return out
}

/** Слово считаем разорванным, если строка кончается на середине слова. */
function endsMidWord(result: string, source: string): boolean {
  const tail = result.replace(/\W+$/, '').split(/\s+/).pop() ?? ''
  if (!tail)
    return false
  // Обрывок — это когда такого слова в исходнике нет, а есть слово, которое
  // с него начинается.
  const words = source.split(/\s+/).map(w => w.replace(/[.,!?;:()]/g, ''))
  return !words.includes(tail) && words.some(w => w.startsWith(tail) && w !== tail)
}

describe('прежнее поведение действительно ломало текст', () => {
  // То, что реально отдавал dev.uhti.kz 13 августа:
  //   /catalog/boys              «…оружие и транспорт дл (Hstar, Mattel, MokaToys)»
  //   /catalog/constructors-root «…широкий выбо (CaDA, Feelo, Gudi)»
  //   /catalog/kiddy             «…помощники в  (Hola Toys, Huanger, Joy Toy)»
  it.each([
    ['boys', REAL.boys, 'транспорт дл'],
    ['constructors', REAL.constructors, 'широкий выбо'],
    ['kiddy', REAL.kiddy, 'помощники в '],
  ])('%s: обрывало слово', (_name, text, broken) => {
    expect(legacyLead(text, BRANDS)).toContain(broken)
  })

  /*
   * Сборка с тех пор сменилась (`composeCategoryLead` → `composeCategoryMeta`),
   * но гарантия та же: тексты из прод-базы не должны рубиться посреди слова.
   */
  it('новая сборка тех же обрывков не даёт', () => {
    const boys = composeCategoryMeta({
      categoryName: 'Игрушки для мальчиков',
      lead: REAL.boys,
      productsCount: 47,
      minPrice: 3490,
      topBrands: BRANDS,
    })
    const constructors = composeCategoryMeta({
      categoryName: 'Конструкторы',
      lead: REAL.constructors,
      productsCount: 19,
      minPrice: 6190,
      topBrands: BRANDS,
    })
    expect(boys).not.toContain('транспорт дл ')
    expect(constructors).not.toContain('широкий выбо ')
  })
})

describe('clampDescription', () => {
  it('короткое описание не трогает', () => {
    const short = 'Игрушки в Алматы. Доставка за день.'
    expect(clampDescription(short)).toBe(short)
  })

  it('длинное обрезает по границе слова и ставит многоточие', () => {
    const long = `${'Конструкторы и наборы для детей всех возрастов. '.repeat(6)}Конец`
    const out = clampDescription(long)

    expect(out.endsWith('...')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT + 3)
    expect(endsMidWord(out.slice(0, -3), long)).toBe(false)
  })

  it('пустой вход не роняет', () => {
    expect(clampDescription(null)).toBe('')
  })
})

describe('pluralRu', () => {
  it('склоняет по последней цифре', () => {
    expect(pluralRu(1, 'модель', 'модели', 'моделей')).toBe('модель')
    expect(pluralRu(3, 'модель', 'модели', 'моделей')).toBe('модели')
    expect(pluralRu(7, 'модель', 'модели', 'моделей')).toBe('моделей')
  })

  /* Отдельная ветка: 11–14 всегда «моделей», хотя цифра в конце обманчива. */
  it('второй десяток не обманывает', () => {
    expect(pluralRu(11, 'модель', 'модели', 'моделей')).toBe('моделей')
    expect(pluralRu(12, 'модель', 'модели', 'моделей')).toBe('моделей')
    expect(pluralRu(14, 'модель', 'модели', 'моделей')).toBe('моделей')
  })

  /*
   * Прежняя формула на странице каталога была `n < 5 ? 'модели' : 'моделей'`
   * и на 22 давала «22 моделей». Проверяем именно этот случай.
   */
  it('за двадцаткой счёт начинается заново', () => {
    expect(pluralRu(21, 'модель', 'модели', 'моделей')).toBe('модель')
    expect(pluralRu(22, 'модель', 'модели', 'моделей')).toBe('модели')
    expect(pluralRu(25, 'модель', 'модели', 'моделей')).toBe('моделей')
  })
})

/*
 * `formatPrice` разделяет тысячи НЕРАЗРЫВНЫМ пробелом (U+00A0) — намеренно,
 * чтобы «5 090 ₸» не разрывалось переносом. В ожиданиях писать невидимый
 * символ нельзя: глазами он неотличим от обычного пробела, и тест падает с
 * сообщением, в котором обе строки выглядят одинаково. Поэтому сравниваем
 * через нормализацию.
 */
function plain(text: string): string {
  return text.replace(/\u00A0/g, ' ')
}

describe('composeCategoryMeta', () => {
  const base = {
    categoryName: 'Куклы',
    productsCount: 48,
    minPrice: 3690,
    topBrands: ['L.O.L. Surprise', 'Defa Lucy'],
  }

  it('вперёд идут товар, количество и цена', () => {
    const meta = composeCategoryMeta(base)
    expect(plain(meta).startsWith('Куклы в Алматы: 48 моделей от 3 690 ₸.')).toBe(true)
    expect(meta).toContain('Доставка за 1 день, самовывоз')
  })

  /*
   * Мобильная выдача обрезает около 120 знаков, а это 79 % показов сайта.
   * Значит суть обязана уместиться в первую сотню, а не оказаться за хвостом.
   */
  it('суть помещается в первые 120 знаков', () => {
    const head = composeCategoryMeta(base).slice(0, 120)
    expect(head).toContain('48 моделей')
    expect(plain(head)).toContain('3 690 ₸')
  })

  it('эмодзи не остаётся', () => {
    const meta = composeCategoryMeta({
      ...base,
      rating: 5,
      reviewsCount: 40,
    })
    expect(meta).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2B00}-\u{2BFF}\u{2600}-\u{27BF}]/u)
  })

  /*
   * Пять звёзд с одного отзыва — то, что стояло в выдаче до 2 сентября 2026.
   * Рейтинг показываем только когда за ним есть хоть какая-то выборка.
   */
  it('рейтинг по одному отзыву не показывается', () => {
    const meta = composeCategoryMeta({ ...base, rating: 5, reviewsCount: 1 })
    expect(meta).not.toContain('рейтинг')
  })

  it('рейтинг от порога — показывается и склоняется', () => {
    const meta = composeCategoryMeta({
      ...base,
      topBrands: [],
      rating: 4.75,
      reviewsCount: 23,
    })
    expect(meta).toContain('рейтинг 4,8 из 5 по 23 отзывам')
  })

  it('бренды попадают целиком или не попадают вовсе', () => {
    const meta = composeCategoryMeta({
      ...base,
      categoryName: 'Конструкторы для мальчиков и девочек любого возраста',
      topBrands: ['Play Smart', 'MG Toys', 'Shantou Yisheng'],
      rating: 4.9,
      reviewsCount: 30,
    })
    expect(meta.includes('Бренды:')).toBe(false)
    expect(meta.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })

  it('без количества и цены остаётся осмысленная строка', () => {
    const meta = composeCategoryMeta({
      categoryName: 'Куклы',
      productsCount: null,
      minPrice: null,
      topBrands: [],
    })
    expect(meta).toBe('Куклы в Алматы. Доставка за 1 день, самовывоз.')
  })

  it('одна модель — единственное число', () => {
    const meta = composeCategoryMeta({ ...base, productsCount: 1, topBrands: [] })
    expect(plain(meta)).toContain('1 модель от')
  })

  /*
   * Ветка с написанным руками вступлением: живая фраза человека остаётся
   * впереди, факты дописываются следом, город не повторяется дважды.
   */
  it('ручной текст идёт первым, факты — следом', () => {
    const meta = composeCategoryMeta({
      categoryName: 'Игрушки для девочек',
      lead: 'Куклы, наборы и мягкие игрушки — то, во что играют каждый день.',
      productsCount: 38,
      minPrice: 5090,
      topBrands: [],
    })
    expect(meta.startsWith('Куклы, наборы и мягкие игрушки')).toBe(true)
    expect(plain(meta)).toContain('38 моделей от 5 090 ₸')
    expect(meta).toContain('Доставка по Алматы за 1 день, самовывоз')
  })

  it('город называется один раз', () => {
    const withCityInLead = composeCategoryMeta({
      categoryName: 'Куклы',
      lead: 'Куклы и пупсы с доставкой по Алматы.',
      productsCount: 19,
      minPrice: 3690,
      topBrands: [],
    })
    expect(withCityInLead.match(/Алматы/g)?.length).toBe(1)

    const withoutLead = composeCategoryMeta({
      categoryName: 'Куклы',
      productsCount: 19,
      minPrice: 3690,
      topBrands: [],
    })
    expect(withoutLead.match(/Алматы/g)?.length).toBe(1)
  })

  it('разметка из ручного текста вычищается', () => {
    const meta = composeCategoryMeta({
      categoryName: 'Куклы',
      lead: '<p>Куклы <strong>и пупсы</strong></p>',
      productsCount: 19,
      minPrice: 3690,
      topBrands: [],
    })
    expect(meta).not.toContain('<')
    expect(plain(meta).startsWith('Куклы и пупсы. 19 моделей')).toBe(true)
  })

  it('в лимит укладывается всегда', () => {
    const meta = composeCategoryMeta({
      categoryName: 'Развивающие игрушки и наборы для творчества малышам',
      productsCount: 137,
      minPrice: 1290,
      topBrands: ['Huanger', 'Hola Toys', 'Shantou Yisheng'],
      rating: 4.9,
      reviewsCount: 88,
    })
    expect(meta.length).toBeLessThanOrEqual(META_DESCRIPTION_LIMIT)
  })
})
