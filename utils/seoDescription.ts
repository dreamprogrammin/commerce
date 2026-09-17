/**
 * Мета-описание категории для выдачи.
 *
 * Собиралось оно тремя обрезками через `substring`, и каждая рубила посреди
 * слова. На проде это было видно глазами: «…оружие и транспорт дл (Hst»,
 * «…широкий выбо (», «…первые друзья и помощники в  (Ho».
 *
 * Две отдельные беды, и вторая заметнее первой:
 *  • обрезка по числу знаков, а не по границе слова;
 *  • список брендов приклеивался к тексту ДО обрезки, поэтому нож приходился
 *    на сам список — от «(Hasbro, LEGO)» оставалось «(Hst».
 *
 * Отсюда порядок: сначала укоротить текст, оставив место под бренды, и только
 * потом дописать их целиком.
 */

import { formatPrice } from './formatPrice'
import { truncateWords } from './seoTitle'

/** Сколько знаков отдаём вводной части, до цен, рейтинга и доставки. */
export const CATEGORY_LEAD_LIMIT = 80

/** Google показывает около 160 знаков; 162 + многоточие укладываются в 165. */
export const META_DESCRIPTION_LIMIT = 165
const META_DESCRIPTION_CUT = 162

/**
 * Финальная обрезка готового описания. Отличается от прежней только тем,
 * что не рубит слово пополам.
 */
export function clampDescription(text: string | null | undefined): string {
  const clean = (text ?? '').trim()
  if (clean.length <= META_DESCRIPTION_LIMIT)
    return clean

  return `${truncateWords(clean, META_DESCRIPTION_CUT)}...`
}

/*
 * `composeCategoryLead` ЖИЛ ЗДЕСЬ и удалён 2 сентября 2026 вместе со своим
 * последним вызовом.
 *
 * Он вставлял список брендов в написанный руками текст категории —
 * «…для мальчиков (Hstar, Mattel, MokaToys)». Теперь ручной текст приходит
 * в `composeCategoryMeta` как `lead`, а бренды дописываются в конец
 * отдельным предложением и только если помещаются целиком. Правило
 * «целиком или никак» из прежней функции сохранено — обрезанный список
 * читается как опечатка, на этом уже обжигались.
 *
 * Обрезка по границе слова, ради которой всё затевалось в августе, живёт
 * в `truncateWords` (utils/seoTitle.ts) и проверяется её тестами.
 */

/**
 * Ниже этого числа отзывов рейтинг в сниппете — не довод, а шум.
 *
 * До 2 сентября 2026 описание категории выводило «⭐⭐⭐⭐⭐ 5,0 (1 отз)»:
 * пять звёзд, собранных с ОДНОГО отзыва. Пользы от такой строки нет, а места
 * она занимает пятнадцать знаков из ста шестидесяти — и вытесняет цену
 * и число моделей, то есть ровно то, из-за чего в выдаче кликают.
 */
export const MIN_REVIEWS_FOR_SNIPPET = 5

/** Русское склонение по числу: 1 модель, 2 модели, 5 моделей, 22 модели. */
export function pluralRu(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const abs = Math.abs(count) % 100
  const last = abs % 10

  if (abs > 10 && abs < 20)
    return many
  if (last > 1 && last < 5)
    return few
  if (last === 1)
    return one

  return many
}

/**
 * Признаки описания, собранного СТАРЫМ шаблоном.
 *
 * Такие строки лежат в `category_brand_seo.seo_description` с прежних
 * генераций: они открываются эмодзи «💰 Цены от…», вставляют ряд звёзд и
 * обещают «доставку за 1 день», чего магазин не делает — по `/terms` это 1–3
 * рабочих дня. На 15 сентября 2026 таких строк пять из четырнадцати,
 * остальные девять написаны руками и этих признаков не имеют.
 *
 * Страница по этому признаку предпочитает собрать описание заново, а не
 * показывать сохранённое: переписывать чужой текст в базе мы не можем, а
 * отдавать в выдачу неверный срок — тем более.
 */
export function hasLegacyTemplateMarks(text: string | null | undefined): boolean {
  if (!text)
    return false
  // ⭐ (U+2B50) лежит вне диапазона «прочих символов», поэтому блок 2B тоже.
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(text)
    || /за 1 день/i.test(text)
    || /заказывайте/i.test(text)
}

/** Цена в формате сниппета: «6 190». */
export function formatPriceRu(price: number): string {
  return formatPrice(price)
}

/*
 * Сроки — из опубликованных условий `/terms`: по Алматы 1–3 рабочих дня.
 * До 15 сентября 2026 в сниппетах стояло «за 1 день»; за день магазин не
 * возит, и то же «1–2 дня» из макета лендинга уже правилось на 1–3 по этой
 * причине.
 *
 * Самовывоз остаётся: он не обещание на бумаге, а основной способ получения
 * (`utils/orderStatus.ts` — 42 заказа из 45). Отдельная беда в том, что адрес
 * выдачи нигде не опубликован: `pickup_points` пуста, и на оформлении блок с
 * пунктом не рисуется — но это чинится заведением пункта в админке, а не
 * вычёркиванием слова из сниппета.
 *
 * Строка одна на весь сайт намеренно: пока она была написана в каждом месте
 * заново, «за 1 день» пережило три чистки подряд и осталось в запасном
 * описании карточки (найдено 17 сентября 2026).
 */
export const DELIVERY_SHORT = 'Доставка 1–3 дня, самовывоз'

/** Та же строка, но с городом — когда выше по тексту его ещё не называли. */
export function deliveryLine(city: string, cityAlreadyMentioned: boolean): string {
  return cityAlreadyMentioned
    ? DELIVERY_SHORT
    : `Доставка по ${city} 1–3 дня, самовывоз`
}

export interface ProductMetaFacts {
  /** Название товара как в каталоге — уже содержит артикул и обычно возраст. */
  name: string
  /** «для девочек» / «для мальчиков», если в названии этого нет. */
  gender?: string | null
  /** «от 3 лет», «от 3 до 6 лет» — тоже только если в названии нет. */
  age?: string | null
  inStock?: boolean
  rating?: number | null
  reviewsCount?: number | null
  price?: number | null
  city?: string
}

/**
 * Запасное мета-описание карточки — для товаров, которым текст в базе не
 * завели. Таких на 17 сентября 2026 двое из 178, но новый товар заводится
 * пустым, и в сниппет уходит именно это.
 *
 * Что здесь важно.
 *
 * **Возраст не повторяется.** Названия в каталоге почти всегда кончаются на
 * «… от 3 лет», а прежний сборщик приклеивал возраст вторым разом: на проде
 * висело «…медицинские инструменты, от 3 лет от 3 лет». Поэтому пол и возраст
 * дописываются только тогда, когда их нет в самом названии.
 *
 * **Обрезается название, а не хвост.** Раньше готовая строка резалась с конца,
 * то есть первой терялась цена — ровно то, ради чего кликают. Теперь хвост
 * (наличие, доставка, цена) считается сначала, а названию отдаётся остаток.
 *
 * **Без эмодзи и без рейтинга с одного отзыва** — по тем же причинам, что в
 * `composeCategoryMeta`: звёзды Google из описания вырежет, а знаки под них
 * потратятся.
 */
export function composeProductMeta(facts: ProductMetaFacts): string {
  const city = facts.city || 'Алматы'
  const name = (facts.name ?? '').trim()
  const lower = name.toLowerCase()

  const audience = [facts.gender, facts.age]
    .filter((part): part is string => !!part && !lower.includes(part.toLowerCase()))
    .join(' ')

  const tail: string[] = []
  if (facts.inStock)
    tail.push('В наличии')
  tail.push(deliveryLine(city, lower.includes(city.toLowerCase())))

  const reviews = facts.reviewsCount ?? 0
  if (facts.rating && reviews >= MIN_REVIEWS_FOR_SNIPPET) {
    const rating = facts.rating.toFixed(1).replace('.', ',')
    tail.push(`Рейтинг ${rating} из 5 по ${reviews} ${pluralRu(reviews, 'отзыву', 'отзывам', 'отзывам')}`)
  }

  // Части хвоста — отдельные предложения, поэтому с прописной.
  if (facts.price && facts.price > 0)
    tail.push(`От ${formatPrice(facts.price)} ₸`)

  const tailText = tail.join('. ')
  // Остаток лимита под название: минус хвост, точка с пробелом и точка в конце.
  const budget = META_DESCRIPTION_LIMIT - tailText.length - 3
  const head = truncateWords(audience ? `${name} ${audience}` : name, Math.max(budget, 40))

  return clampDescription(`${head}. ${tailText}.`)
}

export interface CategoryMetaFacts {
  categoryName: string
  /**
   * Написанное руками вступление (`categories.meta_description`). Если оно
   * есть, начинаем с него: живая фраза человека лучше собранной строки, а
   * факты дописываются следом.
   */
  lead?: string | null
  /** Сколько активных товаров в категории вместе с подкатегориями. */
  productsCount?: number | null
  minPrice?: number | null
  /** Ходовые бренды категории — попадают только целиком. */
  topBrands?: string[]
  city?: string
  rating?: number | null
  reviewsCount?: number | null
}

/**
 * Мета-описание категории из фактов о ней.
 *
 * Что здесь важно и почему именно так.
 *
 * **Порядок.** Мобильная выдача (79 % показов сайта) обрезает описание
 * примерно на 120 знаках, поэтому вперёд идёт то, ради чего кликают:
 * что за товар, сколько его и от какой цены. Доставка, рейтинг и бренды —
 * следом, и если не поместились, потеря невелика.
 *
 * **Без эмодзи.** Прежний шаблон начинал с «💰 Цены от…» и вставлял ряд
 * звёзд. Google в русской выдаче эмодзи из описания вырезает, но знаки под
 * них тратятся; в нашем случае — до пятнадцати на строку рейтинга.
 *
 * **Число товаров — настоящее.** Прежний запасной шаблон писал «В каталоге N
 * моделей», подставляя длину ПЕРВОЙ СТРАНИЦЫ выдачи (12 штук). У категории с
 * полусотней товаров в выдаче стояло «12 моделей» — заниженно и неверно.
 * Здесь число приходит отдельным подсчётом по всей ветке категорий.
 *
 * **Бренды целиком или никак** — то же правило, что в `composeCategoryLead`:
 * обрезанный список читается как опечатка.
 */
export function composeCategoryMeta(facts: CategoryMetaFacts): string {
  const city = facts.city || 'Алматы'
  const count = facts.productsCount && facts.productsCount > 0
    ? facts.productsCount
    : null
  const price = facts.minPrice && facts.minPrice > 0 ? facts.minPrice : null

  const models = count
    ? `${count} ${pluralRu(count, 'модель', 'модели', 'моделей')}`
    : ''
  const from = price ? `от ${formatPrice(price)} ₸` : ''

  const lead = truncateWords((facts.lead ?? '').replace(/<[^>]*>/g, '').trim(), CATEGORY_LEAD_LIMIT)

  let head = lead || `${facts.categoryName.trim()} в ${city}`
  const factsText = models && from
    ? `${models} ${from}`
    : models || from

  if (lead) {
    // После чужого текста факты идут отдельным предложением, а не двоеточием.
    // `truncateWords` уже снял хвостовую пунктуацию — точку ставим сами.
    head = factsText ? `${lead}. ${factsText}` : lead
  }
  else if (models && from) {
    head += `: ${models} ${from}`
  }
  else if (models) {
    head += `: ${models}`
  }
  else if (from) {
    head += ` — ${from}`
  }

  /*
   * Город называем ровно один раз. В обычном случае он уже стоит в начале
   * («Куклы в Алматы: …»), и повторять его в доставке незачем; когда начало
   * пришло из чужого текста, город может там и не встретиться — тогда он
   * едет в строку доставки.
   */
  const cityMentioned = head.toLowerCase().includes(city.toLowerCase())
  const parts = [head, deliveryLine(city, cityMentioned)]

  const reviews = facts.reviewsCount ?? 0
  if (facts.rating && reviews >= MIN_REVIEWS_FOR_SNIPPET) {
    const rating = facts.rating.toFixed(1).replace('.', ',')
    parts.push(
      `рейтинг ${rating} из 5 по ${reviews} ${pluralRu(reviews, 'отзыву', 'отзывам', 'отзывам')}`,
    )
  }

  const brands = (facts.topBrands ?? []).filter(Boolean).slice(0, 3)
  if (brands.length > 0) {
    const withBrands = `${parts.join('. ')}. Бренды: ${brands.join(' · ')}.`
    if (withBrands.length <= META_DESCRIPTION_LIMIT)
      return withBrands
  }

  return clampDescription(`${parts.join('. ')}.`)
}
