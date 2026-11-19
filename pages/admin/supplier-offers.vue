<script setup lang="ts">
import type { OfferDemandFilter, OfferDemandTopic } from '@/utils/offerDemand'
import type { OfferNarrow, OfferNarrowSummary } from '@/utils/offerQueries'
import type { OrderSheetLine } from '@/utils/orderSheet'
import type { Offer, OfferChannel, OfferGrouping, OfferReading, OfferStatus } from '@/utils/supplierOfferList'
import { useLocalStorage } from '@vueuse/core'
import { Check, ChevronDown, Download, ExternalLink, ImageOff, Inbox, ListChecks, Lock, RefreshCw, Search, Send, ShoppingCart, Sparkles, Undo2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { jpegForSheet, saveOrderFile } from '@/composables/useOrderSheetFile'
import { formatPrice } from '@/utils/formatPrice'
import { DEMAND_REFRESH_COST, formatUsd, formatVolume, trendKind, trendLabel } from '@/utils/marketDemand'
import { DEMAND_LEVEL_TEXT, demandLevel, demandLevelBounds, filterByDemand, OFFER_DEMAND_FILTERS, offerDemand, topicDraft } from '@/utils/offerDemand'
import { narrowLevel, narrowLevelBounds, offerNarrow } from '@/utils/offerQueries'
import { buildOrderWorkbook, groupOrderLines, orderFileName } from '@/utils/orderSheet'
import { plural } from '@/utils/restockOrder'
import { collectedText, dayTitle, groupOffers, modelLabel, offerOrderLine, timeOf } from '@/utils/supplierOfferList'

/*
 * «Товары поставщиков» (4 ноября 2026) — список ссылок умного закупа.
 * Владелец 4.11: «ссылки можно собирать в админке чтобы было удобно можно
 * разгруппировать». «Собрать новые» берёт посты каналов поставщиков после
 * прочитанного: товар — фото со своей подписью и ссылка на пост. Разобранный
 * товар — «Добавил» или «Не брать», и в «Новых» остаётся неразобранное.
 * Сервер — server/utils/supplierOffers.ts.
 *
 * С 5.11 название, артикул и цену с фото читает ИИ — сразу при сборе;
 * не прочлось — «Прочитать». Владелец 4.11: «актуальная цена в чате, если её
 * нет — он читает из картинки».
 */
definePageMeta({ layout: 'admin' })

interface PageData {
  installed: true
  account: boolean
  counts: Record<OfferStatus, number>
  limit: number
  channels: OfferChannel[]
  offers: Offer[]
  /** null — нет миграции чтения ИИ */
  reading: OfferReading | null
  /** Темы «Спроса на рынке»; null — нет миграции спроса */
  topics: OfferDemandTopic[] | null
  /** Точный спрос по запросам товаров; null — нет миграции 20261118120000 */
  narrow: OfferNarrowSummary | null
}

/** Чтение ИИ за запрос сбора или «Прочитать» */
interface ReadReply {
  done: number
  failed: number
  left: number
  off?: 'migration' | 'key' | 'error' | null
}

const STATUSES: { id: OfferStatus, label: string }[] = [
  { id: 'new', label: 'Новые' },
  { id: 'added', label: 'Добавлены' },
  { id: 'skipped', label: 'Не брать' },
]
const GROUPINGS: { id: OfferGrouping, label: string }[] = [
  { id: 'supplier', label: 'Поставщики' },
  { id: 'day', label: 'Дни' },
  // «Списком» путалось бы с видом «Список» (макет 18.11)
  { id: 'none', label: 'Без групп' },
]

const status = ref<OfferStatus>('new')
// Плитка или список — по макету; запоминается в этом браузере
const view = useLocalStorage<'grid' | 'list'>('admin-supplier-offers-view', 'grid')
const VIEWS = [{ id: 'grid', label: 'Плитка' }, { id: 'list', label: 'Список' }] as const
// Свёрнутые группы — заголовок с «Показать»
const collapsed = ref(new Set<string>())
function toggleGroup(key: string) {
  const next = new Set(collapsed.value)
  if (!next.delete(key))
    next.add(key)
  collapsed.value = next
}
// В группе сначала GROUP_SHOW товаров, остальное — «Показать ещё N» (макет «Товары поставщиков»).
// Раскрытая группа остаётся раскрытой при смене статуса и фильтра — ключ группы тот же
const GROUP_SHOW = 12
const opened = ref(new Set<string>())
function openGroup(key: string) {
  opened.value = new Set(opened.value).add(key)
}
function shownOf<T>(g: { key: string, offers: T[] }): T[] {
  return opened.value.has(g.key) ? g.offers : g.offers.slice(0, GROUP_SHOW)
}
// Группировка запоминается в этом браузере
const grouping = useLocalStorage<OfferGrouping>('admin-supplier-offers-grouping', 'supplier')

const { data, pending, error, refresh } = useAsyncData(
  'admin-supplier-offers',
  () => adminFetch<PageData | { installed: false }>('/api/admin/supplier-offers', { query: { status: status.value } }),
  { server: false, watch: [status] },
)
const page = computed(() => data.value?.installed ? data.value : null)
// Спрос (6.11.2026): у каждого товара — тема «Спроса на рынке», если нашлась
const demandFilter = useLocalStorage<OfferDemandFilter>('admin-supplier-offers-demand', 'all')
// До 18.11 был «Есть спрос» ('demand') — в браузере мог остаться
if (!OFFER_DEMAND_FILTERS.some(f => f.id === demandFilter.value))
  demandFilter.value = 'all'
const demandById = computed(() => new Map((page.value?.offers ?? []).map(o => [o.id, page.value?.topics ? offerDemand(o, page.value.topics) : null])))
/*
 * Точный спрос (18.11.2026, владелец: «работает слишком широко, типа по
 * запросу «куклы»»): у товара — запросы покупателя, подобранные ИИ, и ответ
 * DataForSEO по ним. Есть — уровень и «Высокий спрос» по ним; тема остаётся
 * фоном. Нет миграции 20261118120000 — по темам, как прежде.
 */
// Пока DataForSEO не ответил ни на одну фразу — по темам: иначе сразу после миграции у всех «нет данных»
const volumes = computed(() => {
  const v = page.value?.narrow?.volumes
  return v && Object.keys(v).length ? v : null
})
const narrowById = computed(() => new Map((page.value?.offers ?? []).map(o => [o.id, volumes.value ? offerNarrow(o.queries, volumes.value) : null])))
const narrowBounds = computed(() => volumes.value ? narrowLevelBounds(volumes.value) : null)
const groups = computed(() => {
  const p = page.value
  if (!p)
    return []
  const filter = p.topics ? demandFilter.value : 'all'
  const list = groupOffers(filterByDemand(p.offers, p.topics ?? [], filter, volumes.value), p.channels, grouping.value)
  // «Высокий спрос» — внутри группы сверху больший спрос (groupOffers ставит по времени)
  if (filter === 'high') {
    const volumeOf = (o: Offer) => volumes.value ? narrowById.value.get(o.id)?.volume ?? 0 : demandById.value.get(o.id)?.volume ?? 0
    for (const g of list)
      g.offers.sort((a, b) => volumeOf(b) - volumeOf(a))
  }
  return list
})
// Уровень спроса — метка в углу фото: трети своих фраз (или тем) по запросам в месяц
const levelBounds = computed(() => demandLevelBounds(page.value?.topics ?? []))
function levelOf(o: Offer) {
  return volumes.value
    ? narrowLevel(narrowById.value.get(o.id) ?? null, narrowBounds.value)
    : demandLevel(demandById.value.get(o.id) ?? null, levelBounds.value)
}
const itemNarrow = (o: Offer, i: number) => volumes.value ? offerNarrow(o.queries, volumes.value, i) : null
// Пробел в начале <template> Vue съедает («купить»560) — строки собираются здесь
const narrowPhrase = (n: OfferNarrow) => n.phrase ?? n.phrases[0]!.phrase
function narrowOthers(n: OfferNarrow) {
  return n.phrases
    .filter(p => p.phrase !== narrowPhrase(n))
    .map(p => `«${p.phrase}»${p.checked ? ` ${p.volume ? formatVolume(p.volume) : '—'}` : ''}`)
    .join(', ')
}
function itemNarrowText(o: Offer, i: number) {
  const n = itemNarrow(o, i)!
  return `Ищут «${narrowPhrase(n)}»${n.checked ? ` — ${n.volume ? `${formatVolume(n.volume)} в месяц` : 'редко'}` : ''}`
}
const moreLabel = (n: number) => `Показать ещё ${n}`
const listNarrowText = (n: OfferNarrow) => `«${narrowPhrase(n)}»${n.volume ? ` · ${formatVolume(n.volume)}` : ''}`
// Пилюли по макету «Товары поставщиков» (Claude Design, 18.11.2026)
const CARD = 'rounded-[20px] bg-background shadow-sm'
const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-semibold'
const SEGMENTS = 'inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-[3px]'
const segment = (on: boolean) => ['rounded-md px-3 py-1.5 text-sm font-medium transition-colors', on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground']
// На фото — белая подложка у «низкого» и «нет данных»; в списке — серая
const LEVEL_CHIP = {
  high: 'bg-green-100 text-green-700',
  mid: 'bg-amber-100 text-amber-700',
  low: 'bg-background text-muted-foreground',
  none: 'bg-background text-muted-foreground',
  unknown: 'bg-background text-muted-foreground',
} as const
const levelChipFlat = (o: Offer) => LEVEL_CHIP[levelOf(o)].replace('bg-background', 'bg-neutral-100')
const TREND_CHIP = { up: 'bg-green-100 text-green-700', down: 'bg-red-600/10 text-red-700', flat: 'bg-background text-muted-foreground' } as const
function newTopicLink(o: Offer) {
  const d = topicDraft(o)
  return { path: '/admin/demand', query: d ? { newTopic: d.name, keyword: d.keyword } : { newTopic: '' } }
}
const channelById = computed(() => new Map((page.value?.channels ?? []).map(c => [c.id, c])))
const closedWithoutAccount = computed(() => !!page.value && !page.value.account && page.value.channels.some(c => c.closed))

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`

// «Разобрано N из M» — за 30 дней, что держит список
const total = computed(() => page.value ? page.value.counts.new + page.value.counts.added + page.value.counts.skipped : 0)
const decided = computed(() => page.value ? page.value.counts.added + page.value.counts.skipped : 0)
const priceFrom = (it: { priceFrom: 'text' | 'image' | null }) => it.priceFrom === 'text' ? 'цена из подписи' : 'цена с фото'

/** Под карточкой — то, чего нет в заголовке группы */
function meta(o: Offer) {
  const c = channelById.value.get(o.channelId)
  const supplier = c?.supplierName || c?.title || ''
  if (grouping.value === 'supplier')
    return `${dayTitle(o.postedAt)}, ${timeOf(o.postedAt)}`
  if (grouping.value === 'day')
    return `${supplier} · ${timeOf(o.postedAt)}`
  return `${supplier} · ${dayTitle(o.postedAt)}, ${timeOf(o.postedAt)}`
}

// --- Сбор ---
const collecting = ref<{ id: string, added: number } | null>(null)
const channelErrors = ref<Record<string, string>>({})

/**
 * «ИИ прочёл 11, не прочлось 1» — для уведомления; пусто — читать было
 * нечего. Нет ключа или миграции — не здесь: об этом строка над товарами.
 */
function readText(r: ReadReply) {
  const parts: string[] = []
  if (r.done)
    parts.push(`ИИ прочёл ${r.done}`)
  if (r.failed)
    parts.push(`не прочлось ${r.failed} — причина на карточке`)
  if (r.left)
    parts.push(`осталось ${r.left} — нажмите «Прочитать»`)
  if (r.off === 'error')
    parts.push('чтение ИИ не запустилось')
  return parts.join(', ')
}

/*
 * Каналы по очереди, не разом: закрытые читает один аккаунт Telegram, а одну
 * сессию из двух мест сразу Telegram может закрыть. За запрос сервер берёт до
 * 30 товаров канала; ответил `more` — зовём снова.
 */
async function collectAll() {
  const p = page.value
  if (collecting.value || !p)
    return
  channelErrors.value = {}
  let added = 0
  const read: ReadReply = { done: 0, failed: 0, left: 0, off: null }
  for (const channel of p.channels) {
    if (channel.closed && !p.account) {
      channelErrors.value[channel.id] = 'Закрытый канал — подключите аккаунт Telegram'
      continue
    }
    collecting.value = { id: channel.id, added }
    try {
      for (let i = 0; i < 20; i++) {
        const res = await adminFetch<{ added: number, more: boolean, read: ReadReply }>('/api/admin/supplier-offers/collect', {
          method: 'POST',
          body: { channelId: channel.id },
        })
        added += res.added
        read.done += res.read.done
        read.failed += res.read.failed
        // Не читали вовсе — остаток не в счёт: «Прочитать» без ключа не поможет
        if (res.read.off)
          read.off ||= res.read.off
        else
          read.left += res.read.left
        collecting.value = { id: channel.id, added }
        if (!res.more)
          break
      }
    }
    catch (e) {
      channelErrors.value[channel.id] = errorText(e, 'Не удалось собрать')
    }
  }
  collecting.value = null
  const failed = Object.keys(channelErrors.value).length
  const ai = readText(read)
  if (failed)
    toast.error(`Новых товаров: ${added}${ai ? `, ${ai}` : ''}. Не собрано: ${count(failed, 'канал', 'канала', 'каналов')} — причина у канала`)
  else
    toast.success(added ? `Новых товаров: ${added}${ai ? ` · ${ai}` : ''}` : 'Новых товаров нет')
  await refresh()
  await fillQueries(true)
}

// --- Чтение ИИ ---
/** Сколько прочитано за проход «Прочитать»; null — не читаем */
const rereading = ref<number | null>(null)

/** «Прочитать»: что ИИ ещё не прочёл — порциями, пока сервер отвечает `more` */
async function rereadAll() {
  if (rereading.value !== null || collecting.value)
    return
  // Начало прохода: что сервер уже пробовал после него, второй раз не возьмёт
  const before = new Date().toISOString()
  const total: ReadReply = { done: 0, failed: 0, left: 0 }
  rereading.value = 0
  try {
    for (let i = 0; i < 30; i++) {
      const res = await adminFetch<ReadReply & { more: boolean }>('/api/admin/supplier-offers/read', { method: 'POST', body: { before } })
      total.done += res.done
      total.failed += res.failed
      total.left = res.left
      rereading.value = total.done
      if (!res.more)
        break
    }
    const text = readText(total) || 'Читать нечего'
    if (total.failed || total.left)
      toast.error(text)
    else
      toast.success(text)
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось прочитать'))
  }
  finally {
    rereading.value = null
    await refresh()
  }
  await fillQueries(true)
}

// --- Точный спрос (18.11.2026) ---
/** Подобрано запросов за проход; null — не подбираем */
const querying = ref<number | null>(null)

/*
 * Запросы покупателя к прочитанным товарам — порциями, пока сервер отвечает
 * `more`. После сбора и «Прочитать» — сами (`quiet`: без уведомления, если
 * подбирать было нечего); кнопкой — с уведомлением.
 */
async function fillQueries(quiet = false) {
  if (querying.value !== null || !page.value?.narrow)
    return
  if (quiet && !page.value.narrow.withoutQueries)
    return
  querying.value = 0
  let failure: string | null = null
  let off: string | null = null
  try {
    for (let i = 0; i < 20; i++) {
      const res = await adminFetch<{ done: number, more: boolean, off: 'migration' | 'key' | null, error: string | null }>('/api/admin/supplier-offers/queries', { method: 'POST' })
      querying.value += res.done
      failure = res.error
      off = res.off
      if (!res.more)
        break
    }
  }
  catch (e) {
    failure = errorText(e, 'Не удалось подобрать запросы')
  }
  const done = querying.value
  querying.value = null
  // Без ключа после сбора молчим: строка чтения ИИ выше уже зовёт на «Модели ИИ»
  if (off === 'key' && !quiet)
    toast.error('Запросы подбирает ИИ — задайте ключ на странице «Модели ИИ»')
  else if (failure)
    toast.error(`Запросы подобраны у ${count(done, 'товара', 'товаров', 'товаров')}, дальше — ошибка: ${failure}`)
  else if (done || !quiet)
    toast.success(done ? `Запросы покупателей подобраны: ${count(done, 'товар', 'товара', 'товаров')}` : 'Подбирать нечего')
  await refresh()
}

const checking = ref(false)

/**
 * «Узнать спрос»: непроверенные запросы — одной задачей в DataForSEO, потом
 * забираем ответ, как «Спрос на рынке»: каждые 4 с, до 3 минут.
 */
async function checkDemand() {
  if (checking.value)
    return
  checking.value = true
  try {
    const run = await adminFetch<{ run: number, phrases: number }>('/api/admin/supplier-offers/demand', { method: 'POST' })
    toast.info(`Спрос по ${count(run.phrases, 'запросу', 'запросам', 'запросам')} спрошен у DataForSEO — ответ обычно за минуту`)
    for (let i = 0; i < 45; i++) {
      await new Promise(r => setTimeout(r, 4000))
      const res = await adminFetch<{ pending: number }>('/api/admin/demand/collect', { method: 'POST' })
      if (!res.pending)
        break
    }
    await refresh()
    const last = page.value?.narrow?.last
    if (last?.status === 'failed')
      toast.error(last.error ?? 'DataForSEO не ответил')
    else if (last?.status === 'done')
      toast.success(`DataForSEO ответил: ${count(last.items ?? 0, 'запрос', 'запроса', 'запросов')}`)
    else
      toast.info('Ответа ещё нет — обновите страницу через пару минут')
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось спросить DataForSEO'))
  }
  finally {
    checking.value = false
  }
}

// --- Разбор ---
const busy = ref(new Set<string>())
const STATUS_DONE: Record<OfferStatus, string> = { new: 'Вернул в новые', added: 'Отмечено: добавил на сайт', skipped: 'Отмечено: не брать' }

async function setStatus(offer: Offer, to: OfferStatus, undo = false) {
  const from = offer.status
  busy.value.add(offer.id)
  try {
    await adminFetch('/api/admin/supplier-offers/status', { method: 'POST', body: { ids: [offer.id], status: to } })
    const p = page.value
    // data у useAsyncData — неглубокая ссылка: правка внутри не перерисует, только замена целиком
    if (p) {
      data.value = {
        ...p,
        counts: { ...p.counts, [from]: p.counts[from] - 1, [to]: p.counts[to] + 1 },
        offers: to === status.value ? [...p.offers, { ...offer, status: to }] : p.offers.filter(o => o.id !== offer.id),
      }
    }
    if (!undo)
      toast.success(STATUS_DONE[to], { action: { label: 'Отменить', onClick: () => setStatus({ ...offer, status: to }, from, true) } })
  }
  catch (e) {
    toast.error(errorText(e, 'Не удалось отметить'))
  }
  finally {
    busy.value.delete(offer.id)
  }
}

// --- Заказ поставщику ---
/*
 * Владелец 5.11: «пусть формируется список товара, который мне нужен, в
 * понятную таблицу с картинками, которую я могу скачать и передать
 * поставщику». Выбранное запоминается в этом браузере — снимком строки,
 * чтобы пережить смену вкладки и «Добавил»; файл — utils/orderSheet.ts.
 */
type OrderPick = OrderSheetLine & { key: string }
const picks = useLocalStorage<Record<string, OrderPick>>('admin-supplier-order', {})
const pickList = computed(() => Object.values(picks.value))
const pickGroups = computed(() => groupOrderLines(pickList.value))
const pickKey = (o: Offer, item: number | null) => `${o.id}:${item ?? '-'}`

function addPick(o: Offer, item: number | null) {
  const c = channelById.value.get(o.channelId)
  const line = offerOrderLine(o, item, c?.supplierName || c?.title || 'Поставщик')
  picks.value = { ...picks.value, [line.key]: line }
}
function removePick(key: string) {
  const { [key]: _, ...rest } = picks.value
  picks.value = rest
}
function setPickQty(key: string, value: string | number) {
  const n = Math.round(Number(value))
  const pick = picks.value[key]
  if (pick && Number.isFinite(n) && n >= 1 && n <= 9999)
    picks.value = { ...picks.value, [key]: { ...pick, quantity: n } }
}

const downloading = ref(false)
async function downloadOrder() {
  if (downloading.value || !pickGroups.value.length)
    return
  downloading.value = true
  const id = toast.loading('Собираю таблицу с фото…')
  try {
    const now = new Date()
    const bytes = await buildOrderWorkbook(pickGroups.value, now, jpegForSheet)
    const single = pickGroups.value.length === 1 ? pickGroups.value[0]!.supplier : undefined
    saveOrderFile(bytes, orderFileName(now, single))
    toast.success('Таблица скачана', { id, description: 'По листу на поставщика' })
  }
  catch {
    toast.error('Не удалось собрать таблицу', { id })
  }
  finally {
    downloading.value = false
  }
}
</script>

<template>
  <!-- Вёрстка по макету «Товары поставщиков.dc.html» (Claude Design, 18.11.2026) -->
  <div class="mx-auto max-w-[1400px] space-y-4 p-4">
    <div class="flex flex-wrap items-end gap-3 px-1 pt-1.5">
      <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink as-child>
                <NuxtLink to="/admin/purchasing">
                  Умный закуп
                </NuxtLink>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Товары поставщиков</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 class="text-[26px] font-bold leading-tight tracking-[-0.02em]">
          Товары поставщиков
        </h1>
        <p class="text-sm text-muted-foreground text-pretty">
          Новые товары из каналов поставщиков за 30 дней. Отметьте каждый: «Добавил» или «Не брать».
        </p>
      </div>
      <Button variant="outline" :disabled="pending || !!collecting" @click="refresh()">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': pending && !!data }" />
        Обновить
      </Button>
      <Button
        v-if="page?.channels.length"
        :disabled="!!collecting || rereading !== null"
        data-testid="offers-collect"
        @click="collectAll"
      >
        <RefreshCw v-if="collecting" class="h-4 w-4 animate-spin" />
        <Download v-else class="h-4 w-4" />
        {{ collecting ? 'Собираю…' : 'Собрать новые' }}
      </Button>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <div v-else-if="pending && !data" class="space-y-4">
        <div class="flex flex-wrap gap-4">
          <Skeleton class="h-40 min-w-0 flex-[1_1_260px] rounded-[20px]" />
          <Skeleton class="h-40 min-w-0 flex-[2_1_460px] rounded-[20px]" />
        </div>
        <Skeleton class="h-96 w-full rounded-[20px]" />
      </div>
      <div v-else-if="data && !page" class="p-5 text-sm text-muted-foreground" :class="CARD" data-testid="offers-not-installed">
        Заработает после миграции базы 20261104160000_supplier_offers.
      </div>
      <template v-else-if="page">
        <div class="flex flex-wrap items-stretch gap-4">
          <!-- Разобрано -->
          <section class="flex min-w-0 flex-[1_1_260px] flex-col gap-3.5 p-5" :class="CARD" data-testid="offers-progress">
            <div class="flex items-center gap-2.5">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ListChecks class="size-5" />
              </span>
              <span class="text-sm font-medium text-muted-foreground">Разобрано</span>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums">{{ decided }}</span>
              <span class="text-[15px] text-muted-foreground">из {{ total }}</span>
            </div>
            <Progress :model-value="total ? decided / total * 100 : 0" class="h-2 bg-muted" :aria-label="`Разобрано ${decided} из ${total}`" />
            <span class="text-[13px] text-muted-foreground">Осталось {{ page.counts.new }}</span>
          </section>

          <!-- Каналы -->
          <section class="flex min-w-0 flex-[2_1_460px] flex-col gap-1 p-5" :class="CARD" data-testid="offers-channels">
            <h2 class="mb-2 text-base font-semibold">
              Каналы поставщиков
            </h2>
            <div v-if="!page.channels.length" class="space-y-3">
              <p class="text-sm text-muted-foreground">
                Каналов нет — их добавляют поставщикам: «⋯» → «Редактировать» → «Каналы в Telegram».
              </p>
              <Button variant="outline" size="sm" as-child>
                <NuxtLink to="/admin/suppliers">
                  Поставщики
                </NuxtLink>
              </Button>
            </div>
            <ul v-else>
              <li v-for="c in page.channels" :key="c.id" class="flex flex-wrap items-center gap-3 border-b border-neutral-100 py-2.5" data-testid="offers-channel">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Lock v-if="c.closed" class="size-[18px]" aria-label="Закрытый канал" />
                  <Send v-else class="size-[18px]" />
                </span>
                <div class="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
                  <span class="break-words text-sm font-medium">{{ c.title }}</span>
                  <span v-if="c.supplierName || c.closed" class="text-xs text-muted-foreground">{{ [c.supplierName, c.closed ? 'закрытый канал' : ''].filter(Boolean).join(' · ') }}</span>
                </div>
                <span v-if="channelErrors[c.id]" class="text-xs text-destructive" data-testid="offers-channel-error">
                  {{ channelErrors[c.id] }}
                </span>
                <span v-else class="text-xs text-muted-foreground">
                  {{ collecting?.id === c.id ? `собираю… новых: ${collecting.added}` : collectedText(c.collectedAt) }}
                </span>
              </li>
            </ul>
            <div v-if="closedWithoutAccount" class="mt-2.5 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" data-testid="offers-no-account">
              <p>Закрытые каналы читаются через аккаунт Telegram — подключите его.</p>
              <Button variant="outline" size="sm" class="shrink-0" as-child>
                <NuxtLink to="/admin/telegram">
                  Аккаунт Telegram
                </NuxtLink>
              </Button>
            </div>
            <!-- Чтение ИИ -->
            <template v-if="page.channels.length">
              <p v-if="!page.reading" class="flex items-center gap-2 pt-2.5 text-[13px] text-muted-foreground" data-testid="offers-reading">
                <Sparkles class="size-4 shrink-0 text-primary" />
                Артикул и цену с фото прочтёт ИИ — после миграции базы 20261105120000_supplier_offers_read.
              </p>
              <div v-else-if="!page.reading.key" class="mt-2.5 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" data-testid="offers-reading">
                <p>Артикул и цену с фото читает ИИ — задайте ключ для {{ modelLabel(page.reading.model) }} на странице «Модели ИИ».</p>
                <Button variant="outline" size="sm" class="shrink-0" as-child>
                  <NuxtLink to="/admin/ai">
                    Модели ИИ
                  </NuxtLink>
                </Button>
              </div>
              <div v-else class="flex flex-col gap-2 pt-2.5 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between" data-testid="offers-reading">
                <p class="flex items-start gap-2">
                  <Sparkles class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Артикул и цену с фото читает {{ modelLabel(page.reading.model) }} при «Собрать новые».
                    <span v-if="page.reading.failed === page.reading.unread && page.reading.unread" data-testid="offers-unread">
                      Не прочлось: {{ page.reading.unread }} — причина на карточке.
                    </span>
                    <span v-else-if="page.reading.unread" data-testid="offers-unread">
                      Не прочитано: {{ page.reading.unread }}<template v-if="page.reading.failed">, из них не прочлось — {{ page.reading.failed }}</template>.
                    </span>
                  </span>
                </p>
                <Button
                  v-if="page.reading.unread"
                  variant="outline"
                  size="sm"
                  class="shrink-0"
                  :disabled="rereading !== null || !!collecting"
                  data-testid="offers-reread"
                  @click="rereadAll"
                >
                  {{ rereading !== null ? `Читаю… ${rereading}` : 'Прочитать' }}
                </Button>
              </div>
              <!-- Точный спрос: запросы покупателя к товарам и ответ DataForSEO -->
              <div v-if="page.narrow" class="flex flex-col gap-2 pt-2.5 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between" data-testid="offers-narrow">
                <p class="flex items-start gap-2">
                  <Search class="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    Точный спрос: ИИ подбирает товару запросы покупателей, DataForSEO отвечает, сколько их ищут.
                    <span v-if="querying !== null" data-testid="offers-narrow-state">Подбираю запросы… {{ querying }}</span>
                    <span v-else-if="page.narrow.pending || checking" data-testid="offers-narrow-state">Ждём ответа DataForSEO…</span>
                    <template v-else>
                      <span v-if="page.narrow.withoutQueries" data-testid="offers-narrow-state">Без запросов: {{ count(page.narrow.withoutQueries, 'товар', 'товара', 'товаров') }}.</span>
                      <span v-if="page.narrow.unchecked" data-testid="offers-narrow-unchecked">Не проверено: {{ count(page.narrow.unchecked, 'запрос', 'запроса', 'запросов') }}.</span>
                      <span v-else-if="!page.narrow.withoutQueries && Object.keys(page.narrow.volumes).length" data-testid="offers-narrow-state">Все запросы проверены.</span>
                      <span v-if="page.narrow.last?.status === 'failed'" class="text-destructive" data-testid="offers-narrow-error">Последняя проверка: {{ page.narrow.last.error }}</span>
                    </template>
                  </span>
                </p>
                <div class="flex shrink-0 gap-2">
                  <Button
                    v-if="page.narrow.withoutQueries && querying === null"
                    variant="outline"
                    size="sm"
                    :disabled="!!collecting || rereading !== null"
                    data-testid="offers-queries"
                    @click="fillQueries()"
                  >
                    Подобрать запросы
                  </Button>
                  <Button
                    v-if="page.narrow.unchecked"
                    size="sm"
                    :disabled="checking || page.narrow.pending || querying !== null"
                    data-testid="offers-check-demand"
                    @click="checkDemand"
                  >
                    {{ checking ? 'Спрашиваю…' : `Узнать спрос · ≈ ${formatUsd(DEMAND_REFRESH_COST / 2)}` }}
                  </Button>
                </div>
              </div>
            </template>
          </section>
        </div>

        <!-- Заказ поставщику: выбранное «В заказ» -->
        <section v-if="pickList.length" class="space-y-3 p-5" :class="CARD" data-testid="order-bar">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm">
              <span class="font-semibold">В заказе {{ count(pickList.length, 'товар', 'товара', 'товаров') }}</span>
              <span class="text-muted-foreground"> · {{ count(pickGroups.length, 'поставщик', 'поставщика', 'поставщиков') }}</span>
            </p>
            <div class="flex gap-2">
              <Button size="sm" :disabled="downloading" data-testid="order-download" @click="downloadOrder">
                <Download class="h-4 w-4" />
                {{ downloading ? 'Собираю…' : 'Скачать таблицу' }}
              </Button>
              <Button size="sm" variant="ghost" :disabled="downloading" data-testid="order-clear" @click="picks = {}">
                Очистить
              </Button>
            </div>
          </div>
          <ul class="text-sm">
            <li v-for="g in pickGroups" :key="g.supplier" class="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-neutral-100 py-1.5" data-testid="order-supplier">
              <span class="font-medium">{{ g.supplier }}</span>
              <span class="tabular-nums text-muted-foreground">
                {{ count(g.lines.length, 'товар', 'товара', 'товаров') }}, {{ g.units }}&nbsp;шт.<template v-if="g.sum"> · {{ formatPrice(g.sum) }}&nbsp;₸</template><template v-if="g.unpriced"> · без цены: {{ g.unpriced }}</template>
              </span>
            </li>
          </ul>
        </section>

        <!-- Отбор, группировка и вид -->
        <div class="flex flex-wrap items-center gap-3 p-3" :class="CARD">
          <div :class="SEGMENTS" role="group" aria-label="Какие товары">
            <button
              v-for="s in STATUSES"
              :key="s.id"
              type="button"
              :class="segment(status === s.id)"
              :aria-pressed="status === s.id"
              :data-testid="`offers-status-${s.id}`"
              @click="status = s.id"
            >
              {{ s.label }} · <span class="tabular-nums">{{ page.counts[s.id] }}</span>
            </button>
          </div>
          <div v-if="page.topics" :class="SEGMENTS" role="group" aria-label="Спрос">
            <button
              v-for="f in OFFER_DEMAND_FILTERS"
              :key="f.id"
              type="button"
              :class="segment(demandFilter === f.id)"
              :aria-pressed="demandFilter === f.id"
              :data-testid="`offers-demand-${f.id}`"
              @click="demandFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <!-- Группировка и вид — одним блоком справа: переносятся вместе -->
          <div class="flex flex-wrap gap-3 lg:ml-auto">
            <div :class="SEGMENTS" role="group" aria-label="Группировка">
              <button
                v-for="g in GROUPINGS"
                :key="g.id"
                type="button"
                :class="segment(grouping === g.id)"
                :aria-pressed="grouping === g.id"
                :data-testid="`offers-group-${g.id}`"
                @click="grouping = g.id"
              >
                {{ g.label }}
              </button>
            </div>
            <div :class="SEGMENTS" role="group" aria-label="Вид">
              <button
                v-for="v in VIEWS"
                :key="v.id"
                type="button"
                :class="segment(view === v.id)"
                :aria-pressed="view === v.id"
                :data-testid="`offers-view-${v.id}`"
                @click="view = v.id"
              >
                {{ v.label }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="!groups.length" class="flex flex-col items-center gap-2.5 px-5 py-12 text-center" :class="CARD" data-testid="offers-empty">
          <span class="flex size-12 items-center justify-center rounded-2xl bg-neutral-100 text-muted-foreground">
            <Inbox class="size-[22px]" />
          </span>
          <span class="text-[15px] font-semibold">{{ page.offers.length ? 'Таких товаров нет' : 'Пока пусто' }}</span>
          <span class="max-w-md text-[13px] text-muted-foreground text-pretty">
            <template v-if="page.offers.length && page.topics && demandFilter !== 'all'">
              {{ demandFilter === 'high' ? 'Высокого спроса нет ни у одного товара — посмотрите «Все» или добавьте темы на «Спросе на рынке».' : 'У всех товаров нашлась тема спроса.' }}
            </template>
            <template v-else-if="status !== 'new'">
              {{ status === 'added' ? 'Здесь будут товары, которые вы выложили на сайт.' : 'Здесь будут товары, которые вы решили не брать.' }}
            </template>
            <template v-else-if="page.channels.some(c => c.collectedAt)">
              Новых товаров нет. Посты, вышедшие позже, соберёт «Собрать новые».
            </template>
            <template v-else>
              Нажмите «Собрать новые» — сюда придут товары из каналов поставщиков за последние 3 дня.
            </template>
          </span>
        </div>

        <section v-for="g in groups" :key="g.key" class="space-y-4" data-testid="offers-group">
          <div
            v-if="g.title"
            class="flex items-center gap-2.5"
            :class="collapsed.has(g.key) ? ['px-4 py-3.5', CARD] : 'px-1 pt-1'"
          >
            <h2 class="text-lg font-bold" data-testid="offers-group-title">
              {{ g.title }}
            </h2>
            <span class="rounded-full px-2.5 py-[3px] text-xs font-semibold tabular-nums text-muted-foreground" :class="collapsed.has(g.key) ? 'bg-neutral-100' : 'bg-background shadow-sm'" data-testid="offers-group-count">{{ g.offers.length }}</span>
            <div class="flex-1" />
            <Button variant="ghost" size="sm" :aria-expanded="!collapsed.has(g.key)" data-testid="offers-group-toggle" @click="toggleGroup(g.key)">
              {{ collapsed.has(g.key) ? 'Показать' : 'Свернуть' }}
              <ChevronDown class="size-3.5 transition-transform" :class="{ 'rotate-180': !collapsed.has(g.key) }" />
            </Button>
          </div>

          <template v-if="!collapsed.has(g.key)">
            <!-- Плитка -->
            <div v-if="view === 'grid'" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
              <article v-for="o in shownOf(g)" :key="o.id" class="flex min-w-0 flex-col gap-3 p-3" :class="CARD" :data-offer-id="o.id" data-testid="offer-card">
                <a :href="o.photoUrl ?? o.postUrl" target="_blank" rel="noopener" class="relative block aspect-square overflow-hidden rounded-[14px] border border-neutral-100 bg-white" :aria-label="o.photoUrl ? 'Фото крупно' : 'Пост в Telegram'">
                  <img v-if="o.photoUrl" :src="o.photoUrl" alt="" loading="lazy" decoding="async" class="h-full w-full object-contain">
                  <span v-else class="flex h-full items-center justify-center text-muted-foreground">
                    <ImageOff class="h-6 w-6" />
                  </span>
                  <span v-if="page.topics" class="absolute left-2.5 top-2.5 shadow-sm" :class="[CHIP, LEVEL_CHIP[levelOf(o)]]" :data-level="levelOf(o)" data-testid="offer-demand-level">
                    {{ DEMAND_LEVEL_TEXT[levelOf(o)] }}
                  </span>
                  <span v-if="o.photoCount > 1" class="absolute bottom-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                    {{ o.photoCount }} фото
                  </span>
                </a>

                <!-- Прочитанное ИИ: первый товар крупно, остальные — строками -->
                <div v-if="o.items?.length" class="flex flex-col gap-3" data-testid="offer-items">
                  <div v-for="(it, i) in o.items.slice(0, 3)" :key="i" class="flex flex-col gap-1.5" :class="i ? 'border-t border-neutral-100 px-1 pt-3' : 'px-1'" data-testid="offer-item">
                    <div v-if="it.price != null" class="flex flex-wrap items-baseline gap-x-2">
                      <span class="whitespace-nowrap font-bold tabular-nums tracking-[-0.01em]" :class="i ? 'text-base' : 'text-xl'" data-testid="offer-price">{{ formatPrice(it.price) }}&nbsp;₸</span>
                      <span class="text-xs text-muted-foreground" data-testid="offer-price-from">{{ priceFrom(it) }}</span>
                    </div>
                    <p class="line-clamp-2 break-words text-sm font-semibold leading-[1.3]" :class="{ 'min-h-[2.6em]': !i }" data-testid="offer-name">
                      {{ it.name }}
                    </p>
                    <p v-if="it.article || it.priceNote" class="break-words text-xs text-muted-foreground">
                      <span v-if="it.article" data-testid="offer-article">Арт. {{ it.article }}</span><template v-if="it.article && it.priceNote">
                        ·
                      </template>{{ it.priceNote }}
                    </p>
                    <p v-if="it.imagePrice != null" class="text-xs text-amber-700" data-testid="offer-price-conflict">
                      На фото другая: {{ formatPrice(it.imagePrice) }}&nbsp;₸
                    </p>
                    <p v-if="it.confidence !== 'high'" class="text-xs text-amber-700" data-testid="offer-doubt">
                      ИИ не уверен{{ it.doubt ? `: ${it.doubt}` : '' }}
                    </p>
                    <p v-if="i && itemNarrow(o, i)" class="break-words text-xs text-muted-foreground" data-testid="offer-item-narrow">
                      {{ itemNarrowText(o, i) }}
                    </p>
                    <!-- У второго и третьего товара поста — свои «На сайт» и «В заказ» -->
                    <div v-if="i" class="flex flex-wrap items-center gap-2 pt-0.5">
                      <Button v-if="o.status === 'new'" as-child size="sm" variant="outline" class="max-w-full" data-testid="offer-to-site">
                        <NuxtLink :to="{ path: '/admin/products/new', query: { offer: o.id, item: i } }">
                          На сайт
                        </NuxtLink>
                      </Button>
                      <Button v-if="picks[pickKey(o, i)]" size="sm" data-testid="offer-order-remove" @click="removePick(pickKey(o, i))">
                        <Check class="h-4 w-4" /> В заказе
                      </Button>
                      <Button v-else size="sm" variant="outline" data-testid="offer-order-add" @click="addPick(o, i)">
                        <ShoppingCart class="h-4 w-4" /> В заказ
                      </Button>
                      <label v-if="picks[pickKey(o, i)]" class="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Input type="number" min="1" max="9999" inputmode="numeric" class="h-8 w-16" aria-label="Сколько штук" :model-value="picks[pickKey(o, i)]!.quantity" data-testid="offer-order-qty" @update:model-value="setPickQty(pickKey(o, i), $event)" />
                        шт.
                      </label>
                    </div>
                  </div>
                  <p v-if="o.items.length > 3" class="px-1 text-xs text-muted-foreground">
                    И ещё {{ count(o.items.length - 3, 'товар', 'товара', 'товаров') }} — в посте
                  </p>
                </div>
                <div v-else class="flex flex-col gap-1.5 px-1">
                  <p class="line-clamp-4 whitespace-pre-line break-words text-sm" :class="{ 'text-muted-foreground': !o.caption }" data-testid="offer-caption">
                    {{ o.caption || 'Без подписи' }}
                  </p>
                  <p v-if="o.items" class="text-xs text-muted-foreground" data-testid="offer-no-items">
                    ИИ не нашёл на фото товара
                  </p>
                  <p v-else-if="o.readError" class="text-xs text-destructive" data-testid="offer-read-error">
                    Не прочитано: {{ o.readError }}
                  </p>
                </div>

                <!-- Спрос: точный — по запросам покупателя к товару; тема «Спроса на рынке» — фоном -->
                <div v-if="page.topics || volumes" class="flex flex-col gap-1 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs" data-testid="offer-demand">
                  <template v-if="volumes">
                    <div v-if="narrowById.get(o.id)" class="flex flex-col gap-0.5" data-testid="offer-narrow">
                      <span class="break-words text-[13px] font-semibold" data-testid="offer-narrow-phrase">«{{ narrowPhrase(narrowById.get(o.id)!) }}»</span>
                      <span class="text-muted-foreground" data-testid="offer-narrow-volume">
                        {{ !narrowById.get(o.id)!.checked ? 'спрос по запросам ещё не проверен' : narrowById.get(o.id)!.volume > 0 ? `${formatVolume(narrowById.get(o.id)!.volume)} поисков в месяц` : 'ищут слишком редко — цифр нет' }}
                      </span>
                      <span v-if="narrowById.get(o.id)!.phrases.length > 1" class="break-words text-[11px] text-muted-foreground" data-testid="offer-narrow-more">
                        ещё: {{ narrowOthers(narrowById.get(o.id)!) }}
                      </span>
                    </div>
                    <span v-else class="text-muted-foreground" data-testid="offer-narrow-none">
                      {{ o.items?.length ? 'Запросы покупателей ещё не подобраны' : 'Запросов нет — товар не прочитан' }}
                    </span>
                  </template>
                  <div v-if="page.topics" :class="volumes ? 'mt-1 flex flex-col gap-0.5 border-t border-neutral-200 pt-1.5' : 'flex flex-col gap-1'" data-testid="offer-topic">
                    <template v-if="demandById.get(o.id)">
                      <div class="flex items-center justify-between gap-2">
                        <span class="min-w-0 break-words" :class="volumes ? 'text-muted-foreground' : 'text-[13px] font-semibold'">{{ volumes ? `Тема «${demandById.get(o.id)!.name}»` : demandById.get(o.id)!.name }}</span>
                        <span v-if="trendLabel(demandById.get(o.id)!.trendPct)" class="px-[7px] py-0.5 text-[11px]" :class="[CHIP, TREND_CHIP[trendKind(demandById.get(o.id)!.trendPct)!]]">{{ trendLabel(demandById.get(o.id)!.trendPct) }}</span>
                      </div>
                      <span v-if="demandById.get(o.id)!.volume != null" class="text-muted-foreground" data-testid="offer-demand-volume">{{ formatVolume(demandById.get(o.id)!.volume) }} поисков в месяц{{ volumes ? ' по теме' : '' }}</span>
                      <span v-else class="text-muted-foreground">цифр спроса ещё нет</span>
                      <span :class="demandById.get(o.id)!.ourTotal ? 'text-muted-foreground' : 'font-semibold text-red-700'" data-testid="offer-demand-ours">
                        {{ demandById.get(o.id)!.ourTotal ? `На сайте ${demandById.get(o.id)!.ourTotal}, в наличии ${demandById.get(o.id)!.ourInStock}` : 'На сайте такого нет' }}{{ demandById.get(o.id)!.seasonSoon ? ' · скоро сезон' : '' }}
                      </span>
                    </template>
                    <p v-else class="text-muted-foreground" data-testid="offer-demand-none">
                      Темы спроса нет ·
                      <NuxtLink :to="newTopicLink(o)" class="font-medium text-primary hover:underline" data-testid="offer-demand-add">
                        Добавить тему
                      </NuxtLink>
                    </p>
                  </div>
                </div>

                <div class="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1 text-xs text-muted-foreground">
                  <span>{{ meta(o) }}</span>
                  <a :href="o.postUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-primary hover:underline" data-testid="offer-post">
                    Пост в Telegram <ExternalLink class="h-3 w-3" />
                  </a>
                </div>

                <!-- Разбор: «На сайт» и «В заказ» — первого товара или всего поста, если не прочитан -->
                <div v-if="o.status === 'new'" class="flex flex-col gap-2">
                  <div class="flex gap-2" :data-testid="o.items?.length ? undefined : 'offer-order-post'">
                    <Button as-child class="min-w-0 flex-1" data-testid="offer-to-site">
                      <NuxtLink :to="{ path: '/admin/products/new', query: o.items && o.items.length > 1 ? { offer: o.id, item: 0 } : { offer: o.id } }">
                        На сайт
                      </NuxtLink>
                    </Button>
                    <Button v-if="picks[pickKey(o, o.items?.length ? 0 : null)]" data-testid="offer-order-remove" @click="removePick(pickKey(o, o.items?.length ? 0 : null))">
                      <Check class="h-4 w-4" /> В заказе
                    </Button>
                    <Button v-else variant="outline" data-testid="offer-order-add" @click="addPick(o, o.items?.length ? 0 : null)">
                      <ShoppingCart class="h-4 w-4" /> В заказ
                    </Button>
                  </div>
                  <label v-if="picks[pickKey(o, o.items?.length ? 0 : null)]" class="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                    Штук в заказе
                    <Input type="number" min="1" max="9999" inputmode="numeric" class="h-8 w-20" aria-label="Сколько штук" :model-value="picks[pickKey(o, o.items?.length ? 0 : null)]!.quantity" data-testid="offer-order-qty" @update:model-value="setPickQty(pickKey(o, o.items?.length ? 0 : null), $event)" />
                  </label>
                  <div class="grid grid-cols-2 gap-2">
                    <Button variant="outline" :disabled="busy.has(o.id)" data-testid="offer-added" @click="setStatus(o, 'added')">
                      <Check class="h-4 w-4" /> Добавил
                    </Button>
                    <Button variant="ghost" :disabled="busy.has(o.id)" data-testid="offer-skipped" @click="setStatus(o, 'skipped')">
                      <X class="h-4 w-4" /> Не брать
                    </Button>
                  </div>
                </div>
                <div v-else class="flex items-center justify-between gap-2">
                  <span :class="[CHIP, o.status === 'added' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-muted-foreground']">{{ o.status === 'added' ? 'Добавлен на сайт' : 'Не берём' }}</span>
                  <Button variant="ghost" size="sm" :disabled="busy.has(o.id)" data-testid="offer-restore" @click="setStatus(o, 'new')">
                    <Undo2 class="h-3.5 w-3.5" /> Вернуть
                  </Button>
                </div>
              </article>
            </div>

            <!-- Список -->
            <div v-else class="py-1.5" :class="CARD">
              <div v-for="o in shownOf(g)" :key="o.id" class="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-neutral-100 px-4 py-3 last:border-b-0" :data-offer-id="o.id" data-testid="offer-row">
                <a :href="o.photoUrl ?? o.postUrl" target="_blank" rel="noopener" class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-100 bg-white" :aria-label="o.photoUrl ? 'Фото крупно' : 'Пост в Telegram'">
                  <img v-if="o.photoUrl" :src="o.photoUrl" alt="" loading="lazy" decoding="async" class="h-full w-full object-contain">
                  <ImageOff v-else class="h-5 w-5 text-muted-foreground" />
                </a>
                <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                  <span class="line-clamp-2 break-words text-sm font-semibold">{{ o.items?.[0]?.name || o.caption.split('\n').find(l => l.trim()) || 'Без подписи' }}</span>
                  <span class="break-words text-xs text-muted-foreground">
                    <template v-if="o.items?.[0]?.article">Арт. {{ o.items[0].article }} · </template><template v-if="o.items?.[0]?.priceNote">{{ o.items[0].priceNote }} · </template><template v-if="(o.items?.length ?? 0) > 1">товаров в посте: {{ o.items!.length }} · </template>{{ meta(o) }} ·
                    <a :href="o.postUrl" target="_blank" rel="noopener" class="text-primary hover:underline">пост</a>
                  </span>
                </div>
                <div class="flex w-24 shrink-0 flex-col gap-0.5">
                  <template v-if="o.items?.[0]?.price != null">
                    <span class="whitespace-nowrap text-base font-bold tabular-nums">{{ formatPrice(o.items[0].price) }}&nbsp;₸</span>
                    <span class="text-[11px] text-muted-foreground">{{ priceFrom(o.items[0]) }}</span>
                  </template>
                  <span v-else class="text-xs text-muted-foreground">цены нет</span>
                </div>
                <div v-if="page.topics || volumes" class="flex min-w-0 flex-[0_1_190px] flex-col items-start gap-1">
                  <span :class="[CHIP, levelChipFlat(o)]">{{ DEMAND_LEVEL_TEXT[levelOf(o)] }}</span>
                  <span v-if="narrowById.get(o.id)" class="break-words text-xs text-muted-foreground">
                    {{ listNarrowText(narrowById.get(o.id)!) }}
                  </span>
                  <span v-if="!page.topics" />
                  <span v-else-if="demandById.get(o.id)" class="text-xs" :class="demandById.get(o.id)!.ourTotal ? 'text-muted-foreground' : 'font-semibold text-red-700'">
                    {{ demandById.get(o.id)!.ourTotal ? `На сайте ${demandById.get(o.id)!.ourTotal}, в наличии ${demandById.get(o.id)!.ourInStock}` : 'На сайте такого нет' }}
                  </span>
                  <span v-else class="text-xs text-muted-foreground">Темы спроса нет</span>
                </div>
                <div v-if="o.status === 'new'" class="flex gap-2">
                  <Button variant="outline" size="sm" :disabled="busy.has(o.id)" @click="setStatus(o, 'added')">
                    Добавил
                  </Button>
                  <Button variant="ghost" size="sm" :disabled="busy.has(o.id)" @click="setStatus(o, 'skipped')">
                    Не брать
                  </Button>
                </div>
                <div v-else class="flex items-center gap-2">
                  <span :class="[CHIP, o.status === 'added' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-muted-foreground']">{{ o.status === 'added' ? 'Добавлен на сайт' : 'Не берём' }}</span>
                  <Button variant="ghost" size="sm" :disabled="busy.has(o.id)" @click="setStatus(o, 'new')">
                    Вернуть
                  </Button>
                </div>
              </div>
            </div>

            <div v-if="g.offers.length > GROUP_SHOW && !opened.has(g.key)" class="flex justify-center">
              <Button variant="outline" data-testid="offers-group-more" @click="openGroup(g.key)">
                {{ moreLabel(g.offers.length - GROUP_SHOW) }}
              </Button>
            </div>
          </template>
        </section>

        <p v-if="page.counts[status] > page.offers.length" class="text-center text-xs text-muted-foreground" data-testid="offers-truncated">
          Показаны последние {{ page.offers.length }} из {{ page.counts[status] }} — разберите их, и появятся следующие.
        </p>
      </template>
    </ClientOnly>
  </div>
</template>
