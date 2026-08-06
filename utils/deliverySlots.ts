/**
 * Желаемые дата и интервал доставки — блоки «Дата» и «Время» из Корзина.dc.html.
 *
 * Выбор хранится индексами, а не готовой датой: индекс 0 всегда значит
 * «сегодня», и сохранённый в localStorage выбор не может протухнуть. Абсолютная
 * дата считается в момент оформления. Иначе покупатель, выбравший «завтра» и
 * вернувшийся через неделю, отправил бы в заказ дату из прошлого.
 */

/** Интервалы доставки. Живут здесь, а не в БД: набор меняется под загрузку курьеров. */
export const DELIVERY_SLOTS = [
  '12:00–14:00',
  '14:00–16:00',
  '16:00–18:00',
  '18:00–20:00',
] as const

/** Длительность интервала — во всех вариантах она одинаковая, показываем как есть. */
export const DELIVERY_SLOT_DURATION = '2 ч'

/** На сколько дней вперёд предлагаем выбор (в макете — четыре кнопки). */
export const DELIVERY_DATE_COUNT = 4

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

export interface DeliveryDateOption {
  /** Дата в формате YYYY-MM-DD — то, что уходит в колонку DATE. */
  iso: string
  /** Подпись для кнопки: «Сегодня, 5 августа». */
  label: string
}

/**
 * Собирает подряд идущие дни начиная с указанного (по умолчанию — сегодня).
 *
 * ISO собираем из локальных компонентов даты, а не через toISOString():
 * последний переводит в UTC, и вечером в Алматы (+05) «сегодня» превратилось
 * бы в предыдущий день.
 */
export function buildDeliveryDates(
  from: Date = new Date(),
  count: number = DELIVERY_DATE_COUNT,
): DeliveryDateOption[] {
  const out: DeliveryDateOption[] = []

  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    const day = d.getDate()
    const month = MONTHS_GENITIVE[d.getMonth()]
    const prefix = i === 0 ? 'Сегодня, ' : i === 1 ? 'Завтра, ' : ''

    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: `${prefix}${day} ${month}`,
    })
  }

  return out
}

/** Индекс в границах списка — на случай мусора из localStorage. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index))
    return 0
  return Math.min(Math.max(Math.trunc(index), 0), Math.max(0, length - 1))
}
