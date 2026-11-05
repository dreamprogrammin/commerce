<script setup lang="ts">
import type { OfferDemandFilter, OfferDemandTopic } from '@/utils/offerDemand'
import type { OrderSheetLine } from '@/utils/orderSheet'
import type { Offer, OfferChannel, OfferGrouping, OfferReading, OfferStatus } from '@/utils/supplierOfferList'
import { useLocalStorage } from '@vueuse/core'
import { ExternalLink, ImageOff, Lock, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { jpegForSheet, saveOrderFile } from '@/composables/useOrderSheetFile'
import { formatPrice } from '@/utils/formatPrice'
import { formatVolume, trendKind, trendLabel } from '@/utils/marketDemand'
import { DEMAND_LEVEL_TEXT, demandLevel, demandLevelBounds, filterByDemand, OFFER_DEMAND_FILTERS, offerDemand, topicDraft } from '@/utils/offerDemand'
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
  { id: 'supplier', label: 'По поставщикам' },
  { id: 'day', label: 'По дням' },
  { id: 'none', label: 'Списком' },
]

const status = ref<OfferStatus>('new')
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
const demandById = computed(() => new Map((page.value?.offers ?? []).map(o => [o.id, page.value?.topics ? offerDemand(o, page.value.topics) : null])))
const groups = computed(() => {
  const p = page.value
  if (!p)
    return []
  const filter = p.topics ? demandFilter.value : 'all'
  const list = groupOffers(filterByDemand(p.offers, p.topics ?? [], filter), p.channels, grouping.value)
  // «Есть спрос» — внутри группы сверху больший спрос (groupOffers ставит по времени)
  if (filter === 'demand') {
    for (const g of list)
      g.offers.sort((a, b) => (demandById.value.get(b.id)?.volume ?? 0) - (demandById.value.get(a.id)?.volume ?? 0))
  }
  return list
})
// Уровень спроса — метка в углу фото: трети своих тем по запросам в месяц
const levelBounds = computed(() => demandLevelBounds(page.value?.topics ?? []))
const levelOf = (o: Offer) => demandLevel(demandById.value.get(o.id) ?? null, levelBounds.value)
const LEVEL_CLASS = {
  high: 'bg-emerald-600 text-white',
  mid: 'bg-amber-400 text-amber-950',
  low: 'bg-slate-200 text-slate-800',
  none: 'bg-slate-200 text-slate-600',
  unknown: 'bg-white/90 text-slate-600',
} as const
const LEVEL_BARS = { high: 3, mid: 2, low: 1, none: 0, unknown: 0 } as const
function newTopicLink(o: Offer) {
  const d = topicDraft(o)
  return { path: '/admin/demand', query: d ? { newTopic: d.name, keyword: d.keyword } : { newTopic: '' } }
}
const TREND_TEXT = { up: 'text-emerald-700', down: 'text-destructive', flat: 'text-muted-foreground' } as const
const channelById = computed(() => new Map((page.value?.channels ?? []).map(c => [c.id, c])))
const closedWithoutAccount = computed(() => !!page.value && !page.value.account && page.value.channels.some(c => c.closed))

const errorText = (e: any, fallback: string) => e?.data?.message || e?.statusMessage || fallback
const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`

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
  <div class="container mx-auto max-w-6xl p-4 md:p-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Товары поставщиков
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Новые товары из каналов поставщиков за 30 дней: фото, подпись и ссылка на пост.
          Разобрали товар — отметьте, и в «Новых» останется только неразобранное.
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button
          v-if="page?.channels.length"
          size="sm"
          :disabled="!!collecting || rereading !== null"
          data-testid="offers-collect"
          @click="collectAll"
        >
          <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': collecting }" />
          {{ collecting ? 'Собираю…' : 'Собрать новые' }}
        </Button>
        <Button variant="outline" size="sm" :disabled="pending || !!collecting" @click="refresh()">
          Обновить
        </Button>
      </div>
    </div>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <Skeleton v-else-if="pending && !data" class="h-64 w-full" />
      <Card v-else-if="data && !page" data-testid="offers-not-installed">
        <CardContent class="text-sm text-muted-foreground">
          Заработает после миграции базы 20261104160000_supplier_offers.
        </CardContent>
      </Card>
      <template v-else-if="page">
        <!-- Каналы -->
        <Card data-testid="offers-channels">
          <CardContent class="space-y-3">
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
            <ul v-else class="divide-y text-sm">
              <li v-for="c in page.channels" :key="c.id" class="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4" data-testid="offers-channel">
                <p class="font-medium">
                  <Lock v-if="c.closed" class="mr-1 inline h-3.5 w-3.5 align-[-2px] text-muted-foreground" aria-label="Закрытый канал" />
                  {{ c.title }}<span v-if="c.supplierName" class="font-normal text-muted-foreground"> · {{ c.supplierName }}</span>
                </p>
                <p v-if="channelErrors[c.id]" class="text-xs text-destructive" data-testid="offers-channel-error">
                  {{ channelErrors[c.id] }}
                </p>
                <p v-else class="text-xs text-muted-foreground">
                  {{ collecting?.id === c.id ? `собираю… новых: ${collecting.added}` : collectedText(c.collectedAt) }}
                </p>
              </li>
            </ul>
            <div v-if="closedWithoutAccount" class="flex flex-col gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" data-testid="offers-no-account">
              <p>Закрытые каналы читаются через аккаунт Telegram — подключите его.</p>
              <Button variant="outline" size="sm" class="shrink-0" as-child>
                <NuxtLink to="/admin/telegram">
                  Аккаунт Telegram
                </NuxtLink>
              </Button>
            </div>
            <!-- Чтение ИИ -->
            <template v-if="page.channels.length">
              <p v-if="!page.reading" class="border-t pt-3 text-xs text-muted-foreground" data-testid="offers-reading">
                Артикул и цену с фото прочтёт ИИ — после миграции базы 20261105120000_supplier_offers_read.
              </p>
              <div v-else-if="!page.reading.key" class="flex flex-col gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between" data-testid="offers-reading">
                <p>Артикул и цену с фото читает ИИ — задайте ключ для {{ modelLabel(page.reading.model) }} на странице «Модели ИИ».</p>
                <Button variant="outline" size="sm" class="shrink-0" as-child>
                  <NuxtLink to="/admin/ai">
                    Модели ИИ
                  </NuxtLink>
                </Button>
              </div>
              <div v-else class="flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between" data-testid="offers-reading">
                <p>
                  Артикул и цену с фото читает {{ modelLabel(page.reading.model) }} — при «Собрать новые».
                  <span v-if="page.reading.failed === page.reading.unread && page.reading.unread" class="text-muted-foreground" data-testid="offers-unread">
                    Не прочлось: {{ page.reading.unread }} — причина на карточке.
                  </span>
                  <span v-else-if="page.reading.unread" class="text-muted-foreground" data-testid="offers-unread">
                    Не прочитано: {{ page.reading.unread }}<template v-if="page.reading.failed">, из них не прочлось — {{ page.reading.failed }}</template>.
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
            </template>
          </CardContent>
        </Card>

        <!-- Заказ поставщику: выбранное «В заказ» -->
        <Card v-if="pickList.length" data-testid="order-bar">
          <CardContent class="space-y-3 pt-6">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm">
                <span class="font-medium">В заказе {{ count(pickList.length, 'товар', 'товара', 'товаров') }}</span>
                <span class="text-muted-foreground"> · {{ count(pickGroups.length, 'поставщик', 'поставщика', 'поставщиков') }}</span>
              </p>
              <div class="flex gap-2">
                <Button size="sm" :disabled="downloading" data-testid="order-download" @click="downloadOrder">
                  {{ downloading ? 'Собираю…' : 'Скачать таблицу' }}
                </Button>
                <Button size="sm" variant="ghost" :disabled="downloading" data-testid="order-clear" @click="picks = {}">
                  Очистить
                </Button>
              </div>
            </div>
            <ul class="divide-y text-sm">
              <li v-for="g in pickGroups" :key="g.supplier" class="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5" data-testid="order-supplier">
                <span class="font-medium">{{ g.supplier }}</span>
                <span class="tabular-nums text-muted-foreground">
                  {{ count(g.lines.length, 'товар', 'товара', 'товаров') }}, {{ g.units }}&nbsp;шт.<template v-if="g.sum"> · {{ formatPrice(g.sum) }}&nbsp;₸</template><template v-if="g.unpriced"> · без цены: {{ g.unpriced }}</template>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <!-- Отбор и группировка -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap gap-2" role="group" aria-label="Какие товары">
            <Button
              v-for="s in STATUSES"
              :key="s.id"
              size="sm"
              :variant="status === s.id ? 'default' : 'outline'"
              :aria-pressed="status === s.id"
              :data-testid="`offers-status-${s.id}`"
              @click="status = s.id"
            >
              {{ s.label }} <span class="ml-1 tabular-nums opacity-70">{{ page.counts[s.id] }}</span>
            </Button>
          </div>
          <div v-if="page.topics" class="flex flex-wrap gap-2" role="group" aria-label="Спрос">
            <Button
              v-for="f in OFFER_DEMAND_FILTERS"
              :key="f.id"
              size="sm"
              :variant="demandFilter === f.id ? 'secondary' : 'ghost'"
              :aria-pressed="demandFilter === f.id"
              :data-testid="`offers-demand-${f.id}`"
              @click="demandFilter = f.id"
            >
              {{ f.label }}
            </Button>
          </div>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Группировка">
            <Button
              v-for="g in GROUPINGS"
              :key="g.id"
              size="sm"
              :variant="grouping === g.id ? 'secondary' : 'ghost'"
              :aria-pressed="grouping === g.id"
              :data-testid="`offers-group-${g.id}`"
              @click="grouping = g.id"
            >
              {{ g.label }}
            </Button>
          </div>
        </div>

        <p v-if="!groups.length" class="py-8 text-center text-sm text-muted-foreground" data-testid="offers-empty">
          <template v-if="page.offers.length && page.topics && demandFilter !== 'all'">
            {{ demandFilter === 'demand' ? 'Ни у одного товара нет темы со спросом — посмотрите «Все» или добавьте темы на «Спросе на рынке».' : 'У всех товаров нашлась тема спроса.' }}
          </template>
          <template v-else-if="status !== 'new'">
            Здесь пока пусто.
          </template>
          <template v-else-if="page.channels.some(c => c.collectedAt)">
            Новых товаров нет. Посты, вышедшие позже, соберёт «Собрать новые».
          </template>
          <template v-else>
            Нажмите «Собрать новые» — сюда придут товары из каналов поставщиков за последние 3 дня.
          </template>
        </p>

        <section v-for="g in groups" :key="g.key" class="space-y-3" data-testid="offers-group">
          <h2 v-if="g.title" class="text-base font-semibold">
            {{ g.title }} <span class="font-normal text-muted-foreground tabular-nums">· {{ g.offers.length }}</span>
          </h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <article v-for="o in g.offers" :key="o.id" class="flex flex-col overflow-hidden rounded-lg border bg-card" data-testid="offer-card">
              <a :href="o.photoUrl ?? o.postUrl" target="_blank" rel="noopener" class="relative block aspect-[4/3] bg-muted" :aria-label="o.photoUrl ? 'Фото крупно' : 'Пост в Telegram'">
                <img v-if="o.photoUrl" :src="o.photoUrl" alt="" loading="lazy" decoding="async" class="h-full w-full object-contain">
                <span v-else class="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff class="h-6 w-6" />
                </span>
                <span v-if="page.topics" class="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium shadow-sm" :class="LEVEL_CLASS[levelOf(o)]" :data-level="levelOf(o)" data-testid="offer-demand-level">
                  <span class="flex h-3 items-end gap-px" aria-hidden="true">
                    <span v-for="n in 3" :key="n" class="w-[3px] rounded-sm" :class="n <= LEVEL_BARS[levelOf(o)] ? 'bg-current' : 'bg-current opacity-30'" :style="{ height: `${n * 4}px` }" />
                  </span>
                  {{ DEMAND_LEVEL_TEXT[levelOf(o)] }}
                </span>
                <span v-if="o.photoCount > 1" class="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
                  {{ o.photoCount }} фото
                </span>
              </a>
              <div class="flex flex-1 flex-col gap-2 p-3">
                <!-- Прочитанное ИИ: цена из подписи главнее цены на фото -->
                <div v-if="o.items?.length" class="space-y-2" data-testid="offer-items">
                  <div v-for="(it, i) in o.items.slice(0, 3)" :key="i" class="space-y-0.5 text-sm" data-testid="offer-item">
                    <p class="line-clamp-2 font-medium leading-snug" data-testid="offer-name">
                      {{ it.name }}
                    </p>
                    <p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span v-if="it.article" class="break-all font-mono text-xs" data-testid="offer-article">Арт. {{ it.article }}</span>
                      <span v-if="it.price != null" class="whitespace-nowrap font-semibold tabular-nums" data-testid="offer-price">{{ formatPrice(it.price) }}&nbsp;₸</span>
                      <span v-if="it.price != null" class="text-xs text-muted-foreground" data-testid="offer-price-from">{{ it.priceFrom === 'text' ? 'в подписи' : 'на фото' }}</span>
                    </p>
                    <p v-if="it.imagePrice != null" class="text-xs text-amber-700" data-testid="offer-price-conflict">
                      На фото другая: {{ formatPrice(it.imagePrice) }}&nbsp;₸
                    </p>
                    <p v-if="it.priceNote" class="text-xs text-muted-foreground">
                      {{ it.priceNote }}
                    </p>
                    <p v-if="it.confidence !== 'high'" class="text-xs text-amber-700" data-testid="offer-doubt">
                      ИИ не уверен{{ it.doubt ? `: ${it.doubt}` : '' }}
                    </p>
                    <div class="flex items-center gap-1.5 pt-1">
                      <template v-if="picks[pickKey(o, i)]">
                        <Input type="number" min="1" max="9999" inputmode="numeric" class="h-8 w-20" aria-label="Сколько штук" :model-value="picks[pickKey(o, i)]!.quantity" data-testid="offer-order-qty" @update:model-value="setPickQty(pickKey(o, i), $event)" />
                        <span class="text-xs text-muted-foreground">шт. в заказе</span>
                        <Button size="sm" variant="ghost" class="h-8 px-2" data-testid="offer-order-remove" @click="removePick(pickKey(o, i))">
                          Убрать
                        </Button>
                      </template>
                      <Button v-else size="sm" variant="outline" class="h-8 px-2" data-testid="offer-order-add" @click="addPick(o, i)">
                        В заказ
                      </Button>
                    </div>
                  </div>
                  <p v-if="o.items.length > 3" class="text-xs text-muted-foreground">
                    И ещё {{ count(o.items.length - 3, 'товар', 'товара', 'товаров') }} — в посте
                  </p>
                </div>
                <p v-else-if="o.items" class="text-xs text-muted-foreground" data-testid="offer-no-items">
                  ИИ не нашёл на фото товара
                </p>
                <p v-else-if="o.readError" class="text-xs text-destructive" data-testid="offer-read-error">
                  Не прочитано: {{ o.readError }}
                </p>
                <div v-if="!o.items?.length" data-testid="offer-order-post">
                  <div class="flex items-center gap-1.5 pt-1">
                    <template v-if="picks[pickKey(o, null)]">
                      <Input type="number" min="1" max="9999" inputmode="numeric" class="h-8 w-20" aria-label="Сколько штук" :model-value="picks[pickKey(o, null)]!.quantity" data-testid="offer-order-qty" @update:model-value="setPickQty(pickKey(o, null), $event)" />
                      <span class="text-xs text-muted-foreground">шт. в заказе</span>
                      <Button size="sm" variant="ghost" class="h-8 px-2" data-testid="offer-order-remove" @click="removePick(pickKey(o, null))">
                        Убрать
                      </Button>
                    </template>
                    <Button v-else size="sm" variant="outline" class="h-8 px-2" data-testid="offer-order-add" @click="addPick(o, null)">
                      В заказ
                    </Button>
                  </div>
                </div>
                <!-- Спрос: тема «Спроса на рынке», нашедшая товар -->
                <div v-if="page.topics" class="text-xs" data-testid="offer-demand">
                  <template v-if="demandById.get(o.id)">
                    <p>
                      <span class="font-medium">Спрос: {{ demandById.get(o.id)!.name }}</span>
                      ·
                      <span v-if="demandById.get(o.id)!.volume != null" class="whitespace-nowrap tabular-nums" data-testid="offer-demand-volume">{{ formatVolume(demandById.get(o.id)!.volume) }}/мес</span>
                      <span v-else class="text-muted-foreground">цифр ещё нет</span>
                      <span v-if="trendLabel(demandById.get(o.id)!.trendPct)" class="whitespace-nowrap" :class="TREND_TEXT[trendKind(demandById.get(o.id)!.trendPct) as keyof typeof TREND_TEXT]"> {{ trendLabel(demandById.get(o.id)!.trendPct) }}</span>
                    </p>
                    <p class="text-muted-foreground" data-testid="offer-demand-ours">
                      {{ demandById.get(o.id)!.ourTotal ? `на сайте ${demandById.get(o.id)!.ourTotal}, в наличии ${demandById.get(o.id)!.ourInStock}` : 'на сайте такого нет' }}{{ demandById.get(o.id)!.seasonSoon ? ' · скоро сезон' : '' }}
                    </p>
                  </template>
                  <p v-else class="text-muted-foreground" data-testid="offer-demand-none">
                    Темы спроса нет ·
                    <NuxtLink :to="newTopicLink(o)" class="text-primary hover:underline" data-testid="offer-demand-add">
                      Добавить тему
                    </NuxtLink>
                  </p>
                </div>
                <p class="whitespace-pre-line break-words text-sm" :class="[o.items?.length ? 'line-clamp-3 text-muted-foreground' : 'line-clamp-4', { 'text-muted-foreground': !o.caption }]" data-testid="offer-caption">
                  {{ o.caption || 'Без подписи' }}
                </p>
                <p class="mt-auto text-xs text-muted-foreground">
                  {{ meta(o) }}
                </p>
                <a :href="o.postUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="offer-post">
                  Пост в Telegram <ExternalLink class="h-3 w-3" />
                </a>
                <!-- «На сайт»: форма нового товара с прочитанным ИИ и фото поста; товаров в посте
                     несколько — у каждого своя ссылка -->
                <div v-if="o.status === 'new' && (o.items?.length ?? 0) > 1" class="flex flex-wrap gap-1.5">
                  <Button v-for="(it, i) in o.items!.slice(0, 3)" :key="i" as-child size="sm" class="max-w-full px-2" data-testid="offer-to-site">
                    <NuxtLink :to="{ path: '/admin/products/new', query: { offer: o.id, item: i } }" class="truncate">
                      На сайт: {{ it.article || it.name }}
                    </NuxtLink>
                  </Button>
                </div>
                <Button v-else-if="o.status === 'new'" as-child size="sm" data-testid="offer-to-site">
                  <NuxtLink :to="{ path: '/admin/products/new', query: { offer: o.id } }">
                    На сайт
                  </NuxtLink>
                </Button>
                <div v-if="o.status === 'new'" class="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="outline" class="px-2" :disabled="busy.has(o.id)" data-testid="offer-added" @click="setStatus(o, 'added')">
                    Добавил
                  </Button>
                  <Button size="sm" variant="ghost" class="px-2" :disabled="busy.has(o.id)" data-testid="offer-skipped" @click="setStatus(o, 'skipped')">
                    Не брать
                  </Button>
                </div>
                <Button v-else size="sm" variant="ghost" :disabled="busy.has(o.id)" data-testid="offer-restore" @click="setStatus(o, 'new')">
                  Вернуть в новые
                </Button>
              </div>
            </article>
          </div>
        </section>

        <p v-if="page.counts[status] > page.offers.length" class="text-center text-xs text-muted-foreground" data-testid="offers-truncated">
          Показаны последние {{ page.offers.length }} из {{ page.counts[status] }} — разберите их, и появятся следующие.
        </p>
      </template>
    </ClientOnly>
  </div>
</template>
