/**
 * «Умный закуп» (3 ноября 2026): отбор товаров поставщиков по спросу и заказ
 * поставщику — одной страницей `/admin/purchasing`. Владелец 3.11: «какая-то
 * неразбериха, собери всё в одном месте касательно умного закупа».
 *
 * Сводку отдаёт `/api/admin/purchasing`, здесь из неё — шаги по порядку: что
 * готово, что идёт, что ждёт владельца и чего ещё нет в коде. Шаги — как
 * договорено 3.11 (docs/HANDOFF.md, «С чего продолжать»).
 */
import { DEMAND_REFRESH_COST, formatUsd } from './marketDemand'
import { plural } from './restockOrder'

/** Сводка `/api/admin/purchasing`. null у части — миграции этого шага на базе ещё нет. */
export interface PurchasingStatus {
  suppliers: number
  channels: {
    total: number
    /** Посты видны без аккаунта (t.me/s/<имя>) */
    open: number
    /** У скольких поставщиков есть хотя бы один канал */
    suppliers: number
  } | null
  demand: {
    topics: number
    hasKey: boolean
    /** Обновление запрошено, ответ DataForSEO ещё не разобран */
    running: boolean
    lastDoneAt: string | null
    /** Последнее обновление не удалось */
    lastFailed: boolean
  } | null
  ai: {
    /** Провайдеры, у которых задан ключ */
    providers: { id: string, label: string }[]
    /** Модель задачи «Чтение постов поставщиков» — `провайдер/модель` */
    model: string
  } | null
  restock: {
    /** Дошли до порога остатка — столько же, сколько на «К закупке» */
    atThreshold: number
    /** Из них без поставщика: не заказать, пока поставщик не назначен */
    noSupplier: number
    /** У скольких поставщиков есть что заказать */
    suppliers: number
    /** Заказаны или в пути; null — миграции заказов ещё нет */
    openOrders: number | null
  }
}

/** done — готово, action — ждёт владельца, running — идёт само, later — ещё в разработке */
export type StepState = 'done' | 'action' | 'running' | 'later'

export interface PurchasingStep {
  id: 'suppliers' | 'demand' | 'ai' | 'digest' | 'order'
  title: string
  /** Зачем шаг — одной строкой */
  about: string
  state: StepState
  /** Цифры шага сейчас */
  facts: string[]
  /** Что сделать (у action) или что дальше */
  next: string | null
  link: { to: string, label: string } | null
}

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
const NO_MIGRATION = 'Заработает после миграции базы.'

function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })
}

function suppliersStep(s: PurchasingStatus): PurchasingStep {
  const step = {
    id: 'suppliers' as const,
    title: 'Поставщики и их каналы',
    about: 'Откуда брать товар: поставщики и их каналы в Telegram, куда они выкладывают фото товаров.',
    link: { to: '/admin/suppliers', label: 'Поставщики' },
  }
  const facts = [s.suppliers ? count(s.suppliers, 'поставщик', 'поставщика', 'поставщиков') : 'поставщиков нет']
  const ch = s.channels
  if (!ch)
    return { ...step, state: 'later', facts, next: NO_MIGRATION }
  if (!ch.total)
    facts.push('каналов в Telegram нет')
  else if (ch.suppliers < s.suppliers)
    facts.push(`${count(ch.total, 'канал', 'канала', 'каналов')} в Telegram — у ${ch.suppliers} из ${count(s.suppliers, 'поставщика', 'поставщиков', 'поставщиков')}`)
  else
    facts.push(`${count(ch.total, 'канал', 'канала', 'каналов')} в Telegram`)
  const closed = ch.total - ch.open
  if (closed)
    facts.push(`через аккаунт: ${closed}`)

  if (!s.suppliers)
    return { ...step, state: 'action', facts, next: 'Добавьте поставщика: «Добавить поставщика», там же — его каналы в Telegram.' }
  if (!ch.total)
    return { ...step, state: 'action', facts, next: 'Добавьте каналы: у поставщика «⋯» → «Редактировать» → «Каналы в Telegram» → вставьте ссылку → «Добавить» → «Сохранить».' }
  return {
    ...step,
    state: 'done',
    facts,
    next: closed ? 'Закрытые каналы читаются только через аккаунт Telegram — его подключим вместе с чтением постов.' : null,
  }
}

function demandStep(s: PurchasingStatus): PurchasingStep {
  const step = {
    id: 'demand' as const,
    title: 'Спрос на рынке',
    about: 'Что ищут в интернете в Казахстане — по темам товаров. По этим цифрам и отбираем товар.',
    link: { to: '/admin/demand', label: 'Спрос на рынке' },
  }
  const d = s.demand
  if (!d)
    return { ...step, state: 'later', facts: [], next: NO_MIGRATION }
  const facts = [count(d.topics, 'тема', 'темы', 'тем'), d.lastDoneAt ? `обновлено ${dayMonth(d.lastDoneAt)}` : 'цифр ещё нет']
  if (!d.hasKey)
    facts.push('ключ DataForSEO не задан')
  const cost = `около ${formatUsd(DEMAND_REFRESH_COST)} с баланса DataForSEO`

  if (d.running)
    return { ...step, state: 'running', facts, next: 'Обновление идёт — откройте «Спрос на рынке», цифры подтянутся там.' }
  if (!d.hasKey)
    return { ...step, state: 'action', facts, next: `Задайте ключ DataForSEO на странице «Спрос на рынке» и нажмите «Обновить сейчас» — ${cost}.` }
  if (d.lastFailed)
    return { ...step, state: 'action', facts, next: 'Последнее обновление не удалось — причина на странице «Спрос на рынке».' }
  if (!d.lastDoneAt)
    return { ...step, state: 'action', facts, next: `Нажмите «Обновить сейчас» на странице «Спрос на рынке» — ${cost}.` }
  return { ...step, state: 'done', facts, next: 'Дальше обновляется само, 5-го числа каждого месяца.' }
}

function aiStep(s: PurchasingStatus): PurchasingStep {
  const step = {
    id: 'ai' as const,
    title: 'ИИ читает посты поставщиков',
    about: 'Модель ИИ узнаёт по фото и тексту поста, что за товар, его артикул и цену.',
    link: { to: '/admin/ai', label: 'Модели ИИ' },
  }
  const ai = s.ai
  if (!ai)
    return { ...step, state: 'later', facts: [], next: NO_MIGRATION }
  if (!ai.providers.length)
    return { ...step, state: 'action', facts: ['ключа ИИ нет'], next: 'Добавьте ключ на странице «Модели ИИ» — Anthropic, OpenAI или Google.' }
  const slash = ai.model.indexOf('/')
  const facts = [
    `${plural(ai.providers.length, 'ключ', 'ключи', 'ключи')}: ${ai.providers.map(p => p.label).join(', ')}`,
    `модель: ${ai.model.slice(slash + 1)}`,
  ]
  if (!ai.providers.some(p => p.id === ai.model.slice(0, slash)))
    return { ...step, state: 'action', facts, next: 'У выбранной модели нет ключа — задайте ключ её провайдера или выберите другую модель на странице «Модели ИИ».' }
  return { ...step, state: 'later', facts, next: 'Ключ есть. Дальше — подобрать модель на 20–30 постах ваших каналов и подключить чтение.' }
}

function orderStep(s: PurchasingStatus): PurchasingStep {
  const step = {
    id: 'order' as const,
    title: 'Заказ поставщику',
    about: 'Товары на пороге остатка сами попадают в заказ своему поставщику — остаётся проверить и отправить.',
    link: { to: '/admin/restock', label: 'К закупке' },
  }
  const r = s.restock
  const withSupplier = r.atThreshold - r.noSupplier
  const facts: string[] = []
  if (withSupplier)
    facts.push(`к закупке ${count(withSupplier, 'товар', 'товара', 'товаров')} у ${count(r.suppliers, 'поставщика', 'поставщиков', 'поставщиков')}`)
  if (r.noSupplier)
    facts.push(`${count(r.noSupplier, 'товар', 'товара', 'товаров')} без поставщика`)
  if (r.openOrders)
    facts.push(`ждём поставку по ${count(r.openOrders, 'заказу', 'заказам', 'заказам')}`)
  if (!facts.length)
    facts.push('заказывать нечего — всё выше порога остатка')

  const todo = [
    withSupplier && 'Откройте «К закупке», проверьте количество и нажмите «Заказал» у поставщика.',
    r.noSupplier && 'Товарам без поставщика назначьте его там же — иначе их не заказать.',
  ].filter(Boolean).join(' ')
  if (todo)
    return { ...step, state: 'action', facts, next: todo }
  if (r.openOrders)
    return { ...step, state: 'running', facts, next: 'Когда товар придёт — «Принять» у заказа, остаток прибавится сам.' }
  return { ...step, state: 'done', facts, next: null }
}

/** Шаги умного закупа по порядку: откуда товар → спрос → чтение постов → сводка → заказ. */
export function purchasingSteps(s: PurchasingStatus): PurchasingStep[] {
  return [
    suppliersStep(s),
    demandStep(s),
    aiStep(s),
    {
      id: 'digest',
      title: 'Сводка «В заказ» / «Пропустить»',
      about: 'Каждый день: новые посты поставщиков → товары → спрос по каждому → сводка в Telegram-бот с кнопками «В заказ» и «Пропустить».',
      state: 'later',
      facts: [],
      next: 'Появится, когда заработают шаги 1–3.',
      link: null,
    },
    orderStep(s),
  ]
}
