/**
 * Строки характеристик для карточки товара — из атрибутов товара, со ссылками.
 *
 * Зачем (23 сентября 2026). Значения атрибутов уходили только в разметку
 * `additionalProperty`, на странице их не было видно вовсе; строка
 * «Количество деталей» ждала тип атрибута `number_range`, которого в базе
 * нет, и не показывалась никогда, хотя число деталей заполнено у 31
 * конструктора. Владелец попросил характеристики, как на карточках «Детского
 * мира», — со ссылками на подборки.
 *
 * Ссылка значения ведёт в раздел товара с фильтром по этому значению
 * (`?attr_<slug>=<вариант>`, `?materials=`, `?countries=` — те же параметры,
 * что пишет панель фильтров каталога). Только если фильтр в этом разделе
 * есть: атрибут, не привязанный к разделу (`category_attributes`), каталог
 * из адреса не читает, и ссылка привела бы на нефильтрованный раздел.
 */

export interface SpecRowOption { id: number, value: string, meta?: unknown }

export interface SpecRowAttributeValue {
  attribute_id: number
  option_id: number | null
  numeric_value: number | string | null
  attributes: {
    name: string
    slug: string
    display_type: string
    unit?: string | null
    attribute_options?: SpecRowOption[] | null
    category_attributes?: { category_id: string }[] | null
  } | null
}

export interface SpecRow {
  key: string
  label: string
  value: string
  to?: string
  /** Цвет образца для атрибута «Цвет» (`attribute_options.meta.hex`). */
  swatch?: string
}

/** Порядок строк: сначала что это за игрушка, потом как работает, потом вид. */
const ORDER = [
  'vid-tehniki',
  'tip-katalki',
  'tip-nabora',
  'tip-igrushki',
  'tip-kukly',
  'pitanie',
  'chastota-upravleniya',
  'masshtab',
  'kolichestvo-detaley',
  'svetovye-effekty',
  'zvukovye-effekty',
  'color',
]

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',')
}

function withQuery(href: string, key: string, value: string | number): string {
  return `${href}${href.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(String(value))}`
}

function hexOf(meta: unknown): string | undefined {
  const hex = (meta as { hex?: unknown } | null)?.hex
  return typeof hex === 'string' && /^#[0-9a-f]{3,8}$/i.test(hex) ? hex : undefined
}

export function attributeSpecRows(input: {
  values: readonly SpecRowAttributeValue[] | null | undefined
  categoryId: string | null | undefined
  categoryHref: string | null | undefined
}): SpecRow[] {
  const rows: (SpecRow & { order: number })[] = []
  for (const v of input.values ?? []) {
    const attr = v.attributes
    if (!attr)
      continue
    const label = attr.name.trim()
    const order = ORDER.includes(attr.slug) ? ORDER.indexOf(attr.slug) : ORDER.length

    if (v.option_id != null) {
      const option = attr.attribute_options?.find(o => o.id === v.option_id)
      if (!option?.value)
        continue
      const filterHere = !!input.categoryId
        && !!input.categoryHref
        && !!attr.category_attributes?.some(ca => ca.category_id === input.categoryId)
      rows.push({
        key: `attr-${attr.slug}`,
        label,
        value: option.value,
        to: filterHere ? withQuery(input.categoryHref!, `attr_${attr.slug}`, option.id) : undefined,
        swatch: attr.display_type === 'color' ? hexOf(option.meta) : undefined,
        order,
      })
    }
    else if (v.numeric_value != null && v.numeric_value !== '') {
      const n = Number(v.numeric_value)
      if (!Number.isFinite(n))
        continue
      const unit = attr.unit?.trim()
      rows.push({ key: `attr-${attr.slug}`, label, value: unit ? `${formatNumber(n)} ${unit}` : formatNumber(n), order })
    }
  }
  return rows
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'ru'))
    .map(({ order: _order, ...row }) => row)
}

/** Материал и страна — ссылками на раздел с фильтром; в каталоге они есть везде. */
export function filterLink(categoryHref: string | null | undefined, key: 'materials' | 'countries', id: number | null | undefined): string | undefined {
  return categoryHref && id != null ? withQuery(categoryHref, key, id) : undefined
}
