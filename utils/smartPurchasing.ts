/**
 * «Умный закуп» (3 ноября 2026): отбор товаров поставщиков по спросу и заказ
 * поставщику — дашбордом `/admin/purchasing`. Владелец 3.11: «какая-то
 * неразбериха, собери всё в одном месте касательно умного закупа», и следом:
 * «я имел в виду дашборд со всеми показателями уровня спроса и юзадж — сколько
 * осталось, сколько поставщиков загружено, — и лишнее с сайд-меню убрать».
 *
 * Сводку отдаёт `/api/admin/purchasing`, здесь из неё — показатели спроса и
 * шаги по порядку: что готово, что идёт, что ждёт владельца и чего ещё нет в
 * коде. Шаги — как договорено 3.11 (docs/HANDOFF.md, «С чего продолжать»).
 */
import type { DemandTopic } from './marketDemand'
import { DEMAND_REFRESH_COST, formatUsd, matchesDemandFilter, sortDemandTopics } from './marketDemand'
import { plural } from './restockOrder'

/** Страницы умного закупа — кнопками на дашборде; в боковом меню их нет */
export const PURCHASING_PAGES = [
  { to: '/admin/suppliers', label: 'Поставщики' },
  { to: '/admin/telegram', label: 'Аккаунт Telegram' },
  { to: '/admin/supplier-offers', label: 'Товары поставщиков' },
  { to: '/admin/demand', label: 'Спрос на рынке' },
  { to: '/admin/ai', label: 'Модели ИИ' },
  { to: '/admin/restock', label: 'К закупке' },
] as const

/** Тема в списках дашборда — числа Google (DataForSEO) */
export interface DemandLine {
  id: string
  name: string
  /** Поисков в месяц, в среднем за 3 последних месяца */
  volume: number | null
  /** Последние 3 месяца к тем же месяцам год назад, % */
  trend: number | null
  series: number[] | null
  peakMonth: number | null
  /** Наших товаров по теме: всего и в наличии */
  ourTotal: number
  ourInStock: number
}

export interface DemandOverview {
  /** Отслеживаемых тем */
  topics: number
  /** Из них с цифрами */
  withData: number
  /** Поисков в месяц по отслеживаемым темам, в среднем за 3 последних месяца; null — цифр нет */
  monthly: number | null
  /** Тот же спрос помесячно — 24 месяца, от старого к новому */
  series: number[] | null
  /** Последние 3 месяца к тем же месяцам год назад, % — как у темы */
  trend: number | null
  dataUntil: string | null
  /** Сколько тем в фильтрах «Спроса на рынке»: ищут, а у нас нет / растёт / падает / скоро сезон */
  missing: number
  growing: number
  falling: number
  season: number
  /** Новые запросы рынка, ещё не разобранные */
  newQueries: number
  top: {
    missing: DemandLine[]
    growing: DemandLine[]
    season: DemandLine[]
    volume: DemandLine[]
  }
}

/** Поставщик на дашборде: что у него на сайте и в Telegram */
export interface SupplierLoad {
  id: string
  name: string
  /** Активных товаров на сайте */
  products: number
  /** Из них на пороге остатка — к закупке */
  toRestock: number
  /** Каналов в Telegram и из них открытых; null — миграции каналов нет */
  channels: number | null
  openChannels: number | null
}

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
  /** Аккаунт Telegram, которым читаются закрытые каналы; null — миграции аккаунта нет */
  telegram: { connected: boolean } | null
  /** «Товары поставщиков» за 30 дней; null — миграции нет */
  offers: {
    /** Ещё не разобраны */
    fresh: number
    added: number
    skipped: number
    /** Последний сбор какого-нибудь канала */
    collectedAt: string | null
  } | null
  demand: {
    hasKey: boolean
    /** Обновление запрошено, ответ DataForSEO ещё не разобран */
    running: boolean
    lastDoneAt: string | null
    /** Последнее обновление не удалось */
    lastFailed: boolean
    /** Во сколько обошлось последнее удачное обновление, $ */
    lastCost: number | null
    /** Остаток на счёте DataForSEO, $; null — ключа нет или DataForSEO не ответил */
    balance: number | null
    balanceError: string | null
    overview: DemandOverview
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
  /** Поставщики по числу товаров на сайте */
  supplierLoad: SupplierLoad[]
  /** Активные товары без поставщика */
  unassigned: { products: number, toRestock: number }
}

/** done — готово, action — ждёт владельца, running — идёт само, later — ещё в разработке */
export type StepState = 'done' | 'action' | 'running' | 'later'

export interface PurchasingStep {
  id: 'suppliers' | 'demand' | 'ai' | 'offers' | 'order'
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

function demandLine(t: DemandTopic): DemandLine {
  return {
    id: t.topic_id,
    name: t.name,
    volume: t.volume_avg3,
    trend: t.trend_pct,
    series: t.series,
    peakMonth: t.peak_month,
    ourTotal: t.our_total,
    ourInStock: t.our_in_stock,
  }
}

/**
 * Показатели спроса для дашборда — по Google (DataForSEO), с теми же
 * фильтрами и порядком, что на «Спросе на рынке». Спрос тем складывается:
 * фразы отслеживаемых тем не повторяются (на бою 3.11 — 162 фразы, общих 0);
 * фраза в двух темах посчиталась бы дважды.
 */
export function demandOverview(topics: DemandTopic[], newQueries: number, top = 5): DemandOverview {
  const active = topics.filter(t => t.is_active)
  const withData = active.filter(t => t.series?.length)
  const len = Math.max(0, ...withData.map(t => t.series!.length))
  const series = len ? Array.from({ length: len }, (_, i) => withData.reduce((sum, t) => sum + (t.series![i] ?? 0), 0)) : null
  // Как trend_pct темы в market_demand_summary: от 30 поисков за 3 месяца год назад
  const last3 = series && len >= 15 ? series[len - 1]! + series[len - 2]! + series[len - 3]! : 0
  const prev3 = series && len >= 15 ? series[len - 13]! + series[len - 14]! + series[len - 15]! : 0
  const pick = (filter: 'missing' | 'growing' | 'falling' | 'season') => topics.filter(t => matchesDemandFilter(t, filter))
  const [missing, growing, season] = [pick('missing'), pick('growing'), pick('season')]
  return {
    topics: active.length,
    withData: withData.length,
    monthly: withData.length ? withData.reduce((sum, t) => sum + (t.volume_avg3 ?? 0), 0) : null,
    series,
    trend: prev3 >= 30 ? Math.round((last3 - prev3) * 100 / prev3) : null,
    dataUntil: withData[0]?.data_until ?? null,
    missing: missing.length,
    growing: growing.length,
    falling: pick('falling').length,
    season: season.length,
    newQueries,
    top: {
      missing: sortDemandTopics(missing).slice(0, top).map(demandLine),
      growing: [...growing]
        .sort((a, b) => (b.trend_pct ?? 0) - (a.trend_pct ?? 0) || (b.volume_avg3 ?? 0) - (a.volume_avg3 ?? 0))
        .slice(0, top)
        .map(demandLine),
      season: sortDemandTopics(season).slice(0, top).map(demandLine),
      volume: sortDemandTopics(withData).slice(0, top).map(demandLine),
    },
  }
}

/** На сколько обновлений спроса хватит остатка: $0,64 → 3 (по $0,18) */
export function refreshesLeft(balance: number): number {
  return Math.max(0, Math.floor((balance + 1e-9) / DEMAND_REFRESH_COST))
}

/** Месяцы ряда спроса, `YYYY-MM-01`: последний — `dataUntil`, остальные по одному назад */
export function seriesMonths(dataUntil: string, length: number): string[] {
  const [y, m] = dataUntil.split('-').map(Number) as [number, number]
  return Array.from({ length }, (_, i) => {
    const n = y * 12 + m - 1 - (length - 1 - i)
    return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}-01`
  })
}

const DAY = 86_400_000

/**
 * Когда спрос обновится сам и спишет с баланса: cron «Market Demand Monthly» —
 * 5-го числа в 04:30 UTC (9:30 по Алматы), и только если за 20 дней до этого
 * удачного обновления не было (`market_demand_request(NULL, true)`).
 */
export function nextAutoRefresh(lastDoneAt: string | null, now = new Date()): string {
  const done = lastDoneAt ? new Date(lastDoneAt).getTime() : null
  const run = (k: number) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 5, 4, 30)
  // Через месяц — всегда: до него больше 20 дней и от «сейчас», и от обновления
  const k = [0, 1].find(k => run(k) > now.getTime() && (done == null || run(k) - done >= 20 * DAY)) ?? 1
  return new Date(run(k)).toISOString()
}

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
  const tg = s.telegram
  if (closed && tg?.connected)
    facts.push('аккаунт Telegram подключён')

  if (!s.suppliers)
    return { ...step, state: 'action', facts, next: 'Добавьте поставщика: «Добавить поставщика», там же — его каналы в Telegram.' }
  if (!ch.total)
    return { ...step, state: 'action', facts, next: 'Добавьте каналы: у поставщика «⋯» → «Редактировать» → «Каналы в Telegram» → вставьте ссылку → «Добавить» → «Сохранить».' }
  if (closed && tg && !tg.connected) {
    return {
      ...step,
      state: 'action',
      facts,
      next: 'Закрытые каналы читаются только через аккаунт Telegram — подключите его на странице «Аккаунт Telegram».',
      link: { to: '/admin/telegram', label: 'Аккаунт Telegram' },
    }
  }
  return {
    ...step,
    state: 'done',
    facts,
    next: closed && !tg ? 'Закрытые каналы читаются только через аккаунт Telegram — его страница заработает после миграции базы.' : null,
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
  const facts = [count(d.overview.topics, 'тема', 'темы', 'тем'), d.lastDoneAt ? `обновлено ${dayMonth(d.lastDoneAt)}` : 'цифр ещё нет']
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

/*
 * Владелец 4.11: «ссылки можно собирать в админке чтобы было удобно можно
 * разгруппировать» — вместо задуманной сводки в Telegram-бот.
 */
function offersStep(s: PurchasingStatus): PurchasingStep {
  const step = {
    id: 'offers' as const,
    title: 'Товары поставщиков',
    about: 'Новые товары из каналов поставщиков: фото, подпись и ссылка на пост. Разобранное отмечаете — добавил на сайт или не брать.',
    link: { to: '/admin/supplier-offers', label: 'Товары поставщиков' },
  }
  const o = s.offers
  if (!o)
    return { ...step, state: 'later', facts: [], next: NO_MIGRATION }
  if (!s.channels?.total)
    return { ...step, state: 'later', facts: ['каналов нет'], next: 'Появится, когда у поставщиков будут каналы в Telegram — шаг 1.' }
  if (!o.collectedAt)
    return { ...step, state: 'action', facts: ['ещё не собирали'], next: 'Откройте «Товары поставщиков» и нажмите «Собрать новые».' }
  const facts = [
    o.fresh ? `не разобрано: ${count(o.fresh, 'товар', 'товара', 'товаров')}` : 'всё разобрано',
    `последний сбор — ${dayMonth(o.collectedAt)}`,
  ]
  if (o.added)
    facts.push(`добавлено на сайт: ${o.added}`)
  if (o.fresh)
    return { ...step, state: 'action', facts, next: 'Разберите новые: «Добавил» — что выложили на сайт, «Не брать» — остальное.' }
  return { ...step, state: 'done', facts, next: 'Посты, вышедшие позже, соберёт «Собрать новые».' }
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

/** Шаги умного закупа по порядку: откуда товар → спрос → чтение постов → товары поставщиков → заказ. */
export function purchasingSteps(s: PurchasingStatus): PurchasingStep[] {
  return [suppliersStep(s), demandStep(s), aiStep(s), offersStep(s), orderStep(s)]
}
