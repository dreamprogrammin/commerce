/**
 * «Мозаика скидок» на главной — макет `DiscountMosaic.dc.html` (claude.ai/design,
 * проект «Прототип для покупателей»). Здесь только выбор товаров и порядок
 * плиток; вёрстка — в `components/home/DiscountMosaic.vue`.
 *
 * Макет получает товары с флагом `big` и сам решает лишь раскладку. Флаг ставим
 * мы, и правило такое:
 *
 * - выборка — самые глубокие скидки (`MOSAIC_POOL_SIZE`), порядок задаёт запрос:
 *   процент по убыванию, при равном — дороже вперёд (больше экономия), затем id,
 *   чтобы HTML не менялся от пересборки к пересборке (ISR пишет запись, только
 *   если HTML другой);
 * - крупные плитки — до трёх товаров с самой большой экономией в тенге, от
 *   разных брендов. В макете крупными стоят LEGO и Barbie — дорогие наборы, где
 *   скидка заметна в деньгах. Без условия о брендах на 23.10.2026 все три
 *   достались бы трём одинаковым куклам Mermaze (по 50%);
 * - мелкие — остальные из выборки в её порядке, не больше `MOSAIC_SMALL_LIMIT`.
 *
 * На бою 23.10.2026: скидка у 169 из 184 товаров в наличии (5–50%), поэтому
 * показываем не все, а лучшие; «Смотреть все» ведёт на `/catalog/promotions`
 * (`is_on_promotion` там совпадает со скидкой — проверено запросом к бою).
 */

export interface MosaicProduct {
  id: string
  slug: string
  name: string
  price: number
  final_price: number | null
  discount_percentage: number
  bonus_points_award: number
  brand_id: string | null
  image_url: string | null
}

export interface MosaicTile extends MosaicProduct {
  big: boolean
}

/** Сколько самых глубоких скидок берёт запрос. */
export const MOSAIC_POOL_SIZE = 40
/** Крупных плиток — не больше трёх, как в макете. */
export const MOSAIC_BIG_LIMIT = 3
/** Мелких — шестнадцать, как в макете: 3 + 16 = 19 плиток, 14 колонок. */
export const MOSAIC_SMALL_LIMIT = 16
/** На одну крупную нужно хотя бы столько товаров, иначе мозаика из одних крупных. */
const PRODUCTS_PER_BIG = 5
/** Мелкие между крупными: 4, 8, 4, 8… — порядок макета (`sizes = [4, 8]`). */
const GROUP_SIZES = [4, 8] as const

/** Скидка в тенге: старая цена минус текущая. */
export function savingsOf(p: Pick<MosaicProduct, 'price' | 'final_price'>): number {
  return Math.max(0, Number(p.price) - Number(p.final_price ?? p.price))
}

/** Скидка есть и цены ей не противоречат — иначе плитке нечего показать. */
function hasRealDiscount(p: MosaicProduct): boolean {
  return p.discount_percentage > 0 && savingsOf(p) > 0
}

/**
 * Делит выборку на крупные и мелкие плитки (правило — в шапке файла).
 * `pool` уже отсортирован запросом; порядок мелких берётся из него.
 */
export function pickMosaic(pool: readonly MosaicProduct[]): { big: MosaicProduct[], small: MosaicProduct[] } {
  const items = pool.filter(hasRealDiscount)
  const bigCount = Math.min(MOSAIC_BIG_LIMIT, Math.floor(items.length / PRODUCTS_PER_BIG))

  // Стабильная сортировка: при равной экономии остаётся порядок запроса.
  const bySavings = [...items].sort((a, b) => savingsOf(b) - savingsOf(a))
  const big: MosaicProduct[] = []
  const brands = new Set<string>()
  for (const p of bySavings) {
    if (big.length >= bigCount)
      break
    // Товар без бренда ни с кем не повторяется.
    if (p.brand_id && brands.has(p.brand_id))
      continue
    if (p.brand_id)
      brands.add(p.brand_id)
    big.push(p)
  }

  const bigIds = new Set(big.map(p => p.id))
  const small = items.filter(p => !bigIds.has(p.id)).slice(0, MOSAIC_SMALL_LIMIT)
  return { big, small }
}

/**
 * Порядок плиток в ленте — перенос `sequence()` из макета. Лента — сетка в две
 * строки с потоком по колонкам: крупная плитка занимает 2×2, мелкие встают по
 * две в колонку. Нечётная последняя группа укорачивается на одну, иначе в
 * последней колонке осталась бы дыра.
 */
export function mosaicSequence(big: readonly MosaicProduct[], small: readonly MosaicProduct[]): MosaicTile[] {
  const out: MosaicTile[] = []
  let si = 0
  for (let bi = 0; bi < big.length || si < small.length; bi++) {
    const per = GROUP_SIZES[bi % GROUP_SIZES.length]
    let group = small.slice(si, si + per)
    si += per
    if (group.length % 2 && si >= small.length)
      group = group.slice(0, -1)
    const head = big[bi]
    if (head)
      out.push({ ...head, big: true })
    for (const p of group)
      out.push({ ...p, big: false })
  }
  return out
}

/** Процент на плашке — как у карточки товара: округлённое поле из базы. */
export function discountPercentOf(p: Pick<MosaicProduct, 'discount_percentage'>): number {
  return Math.round(Number(p.discount_percentage) || 0)
}

/** «до N%» в заголовке — по тем плиткам, что на экране, а не цифра из макета. */
export function maxDiscountOf(tiles: readonly Pick<MosaicProduct, 'discount_percentage'>[]): number {
  return tiles.reduce((max, p) => Math.max(max, discountPercentOf(p)), 0)
}

export type MosaicSeason = 'Зимние' | 'Весенние' | 'Летние' | 'Осенние'

/** Казахстан с 1 марта 2024 года живёт в одном поясе, UTC+5. */
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000

/**
 * В макете «Осенние скидки» — с 1 декабря это стало бы неправдой. Сезон
 * считается по дате в Алматы. Звать только на сервере и класть в payload:
 * страница из кеша, сосчитанная в браузере дата на стыке сезонов дала бы
 * расхождение гидратации.
 */
export function seasonOf(date: Date): MosaicSeason {
  const month = new Date(date.getTime() + ALMATY_OFFSET_MS).getUTCMonth()
  if (month === 11 || month <= 1)
    return 'Зимние'
  if (month <= 4)
    return 'Весенние'
  if (month <= 7)
    return 'Летние'
  return 'Осенние'
}

export function mosaicTitle(season: MosaicSeason, maxDiscount: number): string {
  return `${season} скидки до ${maxDiscount}%`
}
