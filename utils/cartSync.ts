/**
 * Корзина вошедшего в разных браузерах — сверка с серверной (1.11.2026).
 *
 * Владелец: «с другого браузера добавил товары — в моём браузере их нет в
 * корзине, а в Telegram приходят уведомления, что эти товары есть». Серверную
 * корзину (`server_carts`, по ней напоминает бот) браузер читал только при
 * входе; уже вошедший её не читал, а любая его правка перезаписывала сервер
 * своим содержимым.
 *
 * Браузер помнит, какую версию серверной корзины (её `updated_at`) он видел
 * последней и какой у неё был состав (`ServerSyncMark`). Отсюда решение:
 * сервер изменился, а своих правок нет — сервер главнее целиком (добавления,
 * удаления, опустевшая после заказа корзина); правки с обеих сторон или
 * впервые в этом браузере — объединить, как всегда делалось при входе.
 */

export interface CartLine {
  productId: string
  quantity: number
}

/** Чья и какая версия серверной корзины отражена в этой локальной. */
export interface ServerSyncMark {
  userId: string
  /** `server_carts.updated_at` — как его вернул PostgREST */
  at: string
  /** `cartSignature` состава, совпадавшего с сервером */
  signature: string
}

export type CartSyncAction = 'nothing' | 'push' | 'take-server' | 'merge'

/** Подпись состава: одинаковый состав — одна подпись, порядок строк не важен. */
export function cartSignature(lines: CartLine[]): string {
  return lines
    .filter(l => l.quantity > 0)
    .map(l => `${l.productId}:${l.quantity}`)
    .sort()
    .join('|')
}

/**
 * Что делать при сверке с сервером:
 *  - на сервере корзины нет — отправить свою, если она не пуста;
 *  - сервер тот же, что мы видели, — отправить свои правки, если они есть;
 *  - впервые в этом браузере (или другой пользователь), своя корзина пуста —
 *    взять серверную;
 *  - сервер изменился, своих правок нет — взять серверную целиком;
 *  - иначе (вход с гостевой корзиной, правки с обеих сторон) — объединить.
 */
export function decideCartSync(input: {
  userId: string
  mark: ServerSyncMark | null
  server: { at: string } | null
  local: CartLine[]
}): CartSyncAction {
  const localSignature = cartSignature(input.local)
  const mine = input.mark?.userId === input.userId ? input.mark : null
  if (!input.server)
    return localSignature ? 'push' : 'nothing'
  if (mine && mine.at === input.server.at)
    return mine.signature === localSignature ? 'nothing' : 'push'
  if (!localSignature)
    return 'take-server'
  if (mine && mine.signature === localSignature)
    return 'take-server'
  return 'merge'
}

/**
 * Объединение при входе и при правках с обеих сторон: всё, что есть хоть
 * где-то; у общего — большее количество (не сумма: одна и та же покупка,
 * положенная в двух браузерах, не должна удваиваться). Сначала серверные.
 */
export function mergeCartLines(server: CartLine[], local: CartLine[]): CartLine[] {
  const merged = new Map<string, number>()
  for (const line of server)
    merged.set(line.productId, line.quantity)
  for (const line of local)
    merged.set(line.productId, Math.max(merged.get(line.productId) ?? 0, line.quantity))
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }))
}
