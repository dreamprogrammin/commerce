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
 * Пять состояний, которые проходит заказ, — они же пять сегментов полосы
 * прогресса в макете.
 */
const TRACK_STATUSES: OrderStatus[] = [
  'new',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
]

export const ORDER_TRACK_LABELS = [
  'Принят',
  'Подтверждён',
  'Комплектуется',
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
    description: 'Заказ подтверждён и готовится к отправке',
    animation: `${ANIMATIONS_BASE}Success.lottie`,
  },
  processing: {
    title: 'Заказ комплектуется',
    description: 'Собираем ваш заказ и передаём курьеру',
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
 * Вертикальная лента — четыре шага, а не пять: «подтверждён» и
 * «комплектуется» покупателю выглядят одинаково.
 */
export const ORDER_STEPS = [
  {
    icon: 'lucide:check',
    title: 'Заказ принят',
    sub: 'Мы получили ваш заказ и начинаем его обработку',
  },
  {
    icon: 'lucide:package-check',
    title: 'Подтверждён',
    sub: 'Готовим к отправке',
  },
  { icon: 'lucide:truck', title: 'Отправлен', sub: 'В пути' },
  { icon: 'lucide:home', title: 'Доставлен', sub: 'Спасибо за покупку!' },
] as const

const STEP_BY_STATUS: Record<OrderStatus, number> = {
  pending: 0,
  new: 0,
  confirmed: 1,
  processing: 1,
  shipped: 2,
  delivered: 3,
  completed: 3,
  cancelled: -1,
}

export function orderStatusToStep(status: string): number {
  return STEP_BY_STATUS[normalize(status)] ?? 0
}

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
