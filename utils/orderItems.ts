/**
 * Цена позиции заказа на момент покупки.
 *
 * Колонка называется по-разному в зависимости от того, куда смотришь:
 * в проде у `order_items` это `price_at_purchase`, а схема из каталога
 * миграций даёт `price_per_item` (и рядом `bonus_points_per_item`).
 * Схемы разошлись, и запрос, называющий колонку по имени, ломается в одном
 * из окружений: PostgREST отвечает 400 на несуществующее поле.
 *
 * Поэтому позиции запрашиваются целиком (`order_items(*)`), а нужное поле
 * выбирается здесь. Ветку `price_per_item` убрать будет можно, когда прод
 * догонит миграции; до тех пор она не запас на всякий случай, а рабочий путь
 * для локальной разработки.
 *
 * Фолбэк на цену товара оставлен последним: он врёт, если цена менялась после
 * покупки, но пустая строка вместо суммы врёт заметнее.
 */
export interface OrderItemPriceSource {
  price_at_purchase?: number | string | null
  price_per_item?: number | string | null
  product?: { price?: number | null, final_price?: number | null } | null
}

function toNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function orderItemUnitPrice(item: OrderItemPriceSource): number {
  return (
    toNumber(item.price_at_purchase)
    ?? toNumber(item.price_per_item)
    ?? toNumber(item.product?.final_price)
    ?? toNumber(item.product?.price)
    ?? 0
  )
}

/** Была ли сумма взята из заказа, а не подставлена из текущей цены товара. */
export function isHistoricalPrice(item: OrderItemPriceSource): boolean {
  return (
    toNumber(item.price_at_purchase) !== null
    || toNumber(item.price_per_item) !== null
  )
}
