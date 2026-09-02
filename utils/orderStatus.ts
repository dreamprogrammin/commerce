/**
 * Представление статуса заказа: подписи, анимации, позиции в прогрессе.
 *
 * Единственный источник правды на три места — анимированный герой страницы
 * успеха, полоса прогресса под номером заказа и вертикальная лента статусов.
 * Раньше каждый из них носил свою копию списка статусов, и они уже разъехались:
 * лента знала четыре шага, полоса — пять, а маппинги были написаны отдельно.
 */

export type OrderStatus
  = | 'pending'
    | 'new'
    | 'confirmed'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'completed'
    | 'cancelled'

/**
 * Статусы приводим к каноническим: 'pending' — то же самое, что 'new',
 * 'completed' — то же, что 'delivered'. Оба варианта встречаются в БД.
 */
function normalize(status: string): OrderStatus {
  if (status === 'pending')
    return 'new'
  if (status === 'completed')
    return 'delivered'
  return (status as OrderStatus) ?? 'new'
}

/**
 * Пять состояний в том порядке, в котором заказ их РЕАЛЬНО проходит.
 *
 * Порядок снят с кнопок оператора в Telegram (supabase/functions/
 * sync-order-status-to-telegram/index.ts), а не выдуман:
 *
 *   new       «Взять в работу»    → processing  (assign-order-to-admin)
 *   processing «Подтвердить»       → confirmed   (confirm-order)
 *   confirmed  «Передать курьеру»  → shipped     (ship-order)
 *   shipped    «Доставлен»         → delivered   (deliver-order)
 *
 * До 2 сентября 2026 здесь `confirmed` и `processing` стояли МЕСТАМИ
 * НАОБОРОТ. Из-за этого полоса прогресса у покупателя ехала назад: оператор
 * брал заказ в работу — доходило до «Комплектуется» (3 из 5), оператор
 * подтверждал — откатывалось на «Подтверждён» (2 из 5). Именно это владелец
 * и заметил как «статусы идут не по порядку».
 */
const TRACK_STATUSES: OrderStatus[] = [
  'new',
  'processing',
  'confirmed',
  'shipped',
  'delivered',
]

/**
 * Подписи под сегментами. Короткие намеренно: их пять в ряд, и на 390px
 * «Комплектуется» налезало на соседей — поймано скриншотом страницы заказа.
 */
export const ORDER_TRACK_LABELS = [
  'Принят',
  'В работе',
  'Подтверждён',
  'В пути',
  'Доставлен',
] as const

/** Индекс в полосе прогресса. −1 для отменённого: полоса гаснет целиком. */
export function orderStatusToSegment(status: string): number {
  const s = normalize(status)
  if (s === 'cancelled')
    return -1
  const index = TRACK_STATUSES.indexOf(s)
  return index === -1 ? 0 : index
}

export function isOrderCancelled(status: string): boolean {
  return normalize(status) === 'cancelled'
}

/**
 * Анимации лежат в публичном бакете прод-проекта и адресуются абсолютным URL
 * намеренно: в локальной Supabase этих файлов нет, и подстановка runtime-URL
 * оставила бы разработчика с битой анимацией.
 */
const ANIMATIONS_BASE
  = 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/animations/'

interface OrderStatusPresentation {
  title: string
  description: string
  animation: string
}

export const ORDER_STATUS_INFO: Record<OrderStatus, OrderStatusPresentation> = {
  pending: {
    title: 'Заказ принят',
    description: 'Мы получили ваш заказ и начинаем его обработку',
    animation: `${ANIMATIONS_BASE}Order.lottie`,
  },
  new: {
    title: 'Заказ принят',
    description: 'Мы получили ваш заказ и начинаем его обработку',
    animation: `${ANIMATIONS_BASE}Order.lottie`,
  },
  confirmed: {
    title: 'Заказ подтверждён',
    description: 'Собираем заказ и передаём курьеру',
    animation: `${ANIMATIONS_BASE}Success.lottie`,
  },
  processing: {
    // «Комплектуется» здесь было неверным: этот статус ставит
    // assign-order-to-admin, когда оператор берёт заказ в работу, — то есть
    // ДО подтверждения, а не после.
    title: 'Заказ в обработке',
    description: 'Менеджер взял заказ в работу',
    animation: `${ANIMATIONS_BASE}box.lottie`,
  },
  shipped: {
    title: 'Заказ в пути',
    description: 'Курьер уже мчит к вам!',
    animation: `${ANIMATIONS_BASE}delivery-truck.lottie`,
  },
  delivered: {
    title: 'Заказ доставлен',
    description: 'Заказ успешно доставлен',
    animation: `${ANIMATIONS_BASE}delivery.lottie`,
  },
  completed: {
    title: 'Заказ доставлен',
    description: 'Заказ успешно доставлен',
    animation: `${ANIMATIONS_BASE}delivery.lottie`,
  },
  cancelled: {
    title: 'Заказ отменён',
    description: 'Заказ был отменён',
    animation: `${ANIMATIONS_BASE}Order.lottie`,
  },
}

export function orderStatusInfo(status: string): OrderStatusPresentation {
  return ORDER_STATUS_INFO[normalize(status)] ?? ORDER_STATUS_INFO.new
}

/**
 * Вертикальная лента — те же пять шагов, что и полоса прогресса.
 *
 * Раньше их было четыре, со своими подписями: «Заказ принят», «Подтверждён»,
 * «Отправлен», «Доставлен» — и на странице «Заказ принят» лента с полосой
 * висели рядом, показывая РАЗНЫЕ наборы шагов и разные названия одного и
 * того же («В пути» против «Отправлен»). Наборов теперь один.
 */
export const ORDER_STEPS = [
  {
    icon: 'lucide:check',
    title: 'Заказ принят',
    sub: 'Мы получили ваш заказ и начинаем его обработку',
  },
  {
    icon: 'lucide:package-search',
    title: 'В работе',
    sub: 'Менеджер взял заказ в работу',
  },
  {
    icon: 'lucide:package-check',
    title: 'Подтверждён',
    sub: 'Готовим к отправке',
  },
  { icon: 'lucide:truck', title: 'В пути', sub: 'Курьер уже везёт заказ' },
  { icon: 'lucide:home', title: 'Доставлен', sub: 'Спасибо за покупку!' },
] as const

/**
 * Индекс шага в ленте. Совпадает с сегментом полосы: список один и тот же,
 * и разъехаться им теперь нечем.
 */
export const orderStatusToStep = orderStatusToSegment

/**
 * Плашка статуса в списке заказов: короткая подпись, иконка и тон.
 *
 * Тонов четыре — столько же, сколько состояний различает макет «Мои заказы»:
 * отменён, выполнен, доставляется и всё остальное как «в обработке». По тону
 * же список фильтруется вкладками, поэтому отдельного маппинга под фильтр нет.
 */
export type OrderBadgeTone = 'cancelled' | 'done' | 'shipping' | 'processing'

export interface OrderBadge {
  label: string
  icon: string
  tone: OrderBadgeTone
}

const BADGE_BY_STATUS: Record<OrderStatus, OrderBadge> = {
  pending: { label: 'В обработке', icon: 'lucide:clock', tone: 'processing' },
  new: { label: 'В обработке', icon: 'lucide:clock', tone: 'processing' },
  // «Подтверждён» тон делит с обработкой, но подпись своя: покупателю важно
  // видеть, что заказ приняли, а не просто «крутится где-то в системе».
  confirmed: { label: 'Подтверждён', icon: 'lucide:clock', tone: 'processing' },
  processing: { label: 'В обработке', icon: 'lucide:clock', tone: 'processing' },
  shipped: { label: 'Доставляется', icon: 'lucide:truck', tone: 'shipping' },
  delivered: { label: 'Выполнен', icon: 'lucide:check-circle', tone: 'done' },
  completed: { label: 'Выполнен', icon: 'lucide:check-circle', tone: 'done' },
  cancelled: { label: 'Отменён', icon: 'lucide:x-circle', tone: 'cancelled' },
}

export function orderStatusBadge(status: string): OrderBadge {
  return BADGE_BY_STATUS[normalize(status)] ?? BADGE_BY_STATUS.new
}
