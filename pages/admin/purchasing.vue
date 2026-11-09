<script setup lang="ts">
import type { Component } from 'vue'
import type { TrendKind } from '@/utils/marketDemand'
import type { DemandLine, PurchasingStatus, StepState, SupplierLoad } from '@/utils/smartPurchasing'
import type { Battery, BatteryState } from '@/utils/usageBatteries'
import {
  ArrowRight,
  Bot,
  Check,
  Gauge,
  Inbox,
  PackageSearch,
  PackageX,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Truck,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import DemandChart from '@/components/admin/purchasing/DemandChart.vue'
import { dataUntilLabel, DEMAND_REFRESH_COST, formatUsd, formatVolume, peakLabel, sparkPoints, trendKind, trendLabel } from '@/utils/marketDemand'
import { plural } from '@/utils/restockOrder'
import { nextAutoRefresh, PURCHASING_PAGES, purchasingSteps, refreshesLeft, seriesMonths } from '@/utils/smartPurchasing'
import { visionCost } from '@/utils/supplierOfferList'
import { usageBatteries } from '@/utils/usageBatteries'

definePageMeta({ layout: 'admin' })

/*
 * «Умный закуп» — дашборд (3.11.2026; вид — по макету Canvas-2.dc.html из
 * Claude Design, 9.11.2026). Владелец: «собери всё в одном месте», следом —
 * «дашборд со всеми показателями уровня спроса и юзадж: сколько осталось,
 * сколько поставщиков загружено, — и лишнее с сайд-меню убрать».
 * Сверху — четыре цифры; ниже спрос в Google столбиками и «Что сделать
 * сейчас»; потом темы по вкладкам, поставщики и сервисы. Страниц закупа в
 * боковом меню нет — они кнопками под заголовком (в макете их нет, но без
 * них «Аккаунт Telegram» и «Модели ИИ» не открыть).
 * Сводка — `/api/admin/purchasing`, расчёты — `utils/smartPurchasing.ts`.
 */
const { data, pending, error, refresh }
  = useAsyncData('admin-purchasing', () => adminFetch<PurchasingStatus>('/api/admin/purchasing'), { server: false })

const PAGE_ICON: Record<(typeof PURCHASING_PAGES)[number]['to'], Component> = {
  '/admin/suppliers': Truck,
  '/admin/telegram': Send,
  '/admin/supplier-offers': PackageSearch,
  '/admin/demand': Search,
  '/admin/ai': Bot,
  '/admin/restock': ShoppingCart,
}

const CARD = 'rounded-[20px] bg-background shadow-sm'
const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })
const NO_MIGRATION = 'после миграции базы'

// Пилюли: зелёная — растёт или в норме, красная — падает или пусто, жёлтая — мало, серая — нет данных
const CHIP = 'inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-xs font-semibold'
const TREND_CHIP: Record<TrendKind, string> = { up: 'bg-green-100 text-green-700', down: 'bg-red-600/10 text-red-700', flat: 'bg-neutral-100 text-muted-foreground' }
const trendChip = (pct: number | null) => TREND_CHIP[trendKind(pct) ?? 'flat']

const demand = computed(() => data.value?.demand ?? null)
const overview = computed(() => demand.value?.overview ?? null)
const hasNumbers = computed(() => !!overview.value?.withData)
const months = computed(() => {
  const o = overview.value
  return o?.series && o.dataUntil ? seriesMonths(o.dataUntil, o.series.length) : []
})
const range = ref(12)

/** Чтение ИИ за 30 дней: сколько товаров и во что обошлось */
const aiSpend = computed(() => {
  const reading = data.value?.ai?.reading
  if (!reading)
    return null
  const cost = visionCost(reading)
  return {
    posts: reading.reduce((n, m) => n + m.posts, 0),
    cost: cost == null ? 'цена модели неизвестна' : cost > 0 && cost < 0.01 ? 'меньше $0,01' : `≈ ${formatUsd(cost)}`,
  }
})

/** Ключ провайдера выбранной модели: есть / ключи есть, но не того провайдера / ключей нет */
const aiKeyState = computed(() => {
  const ai = data.value?.ai
  if (!ai?.providers.length)
    return 'none'
  return ai.providers.some(p => p.id === ai.model.slice(0, ai.model.indexOf('/'))) ? 'ok' : 'other'
})

// --- Сервисы («батарейки», 6.11.2026): сколько осталось и когда сброс ---
const batteries = computed(() => data.value?.meters ? usageBatteries(data.value.meters) : [])
const BATTERY_ICON: Record<Battery['id'], Component> = { ai_budget: Sparkles, ai_limits: Gauge, dataforseo: Search, telegram: Send }
const BATTERY_TILE: Record<BatteryState, string> = { ok: 'bg-green-100 text-green-700', low: 'bg-amber-100 text-amber-700', empty: 'bg-red-600/10 text-red-700', off: 'bg-neutral-100 text-neutral-500' }
const BATTERY_BAR: Record<BatteryState, string> = { ok: 'bg-primary', low: 'bg-amber-500', empty: 'bg-red-500', off: 'bg-muted-foreground/30' }
function batteryStatus(b: Battery) {
  if (b.id === 'telegram' && b.state === 'low')
    return 'Не собрано'
  if (b.id === 'telegram' && b.state === 'empty')
    return 'Ждём Telegram'
  return { ok: 'В норме', low: 'Мало', empty: 'Пусто', off: 'Нет данных' }[b.state]
}
const budgetOpen = ref(false)
const budgetUsd = ref('')
const budgetReset = ref('')
const budgetSaving = ref(false)
function openBudget() {
  const b = data.value?.meters.aiBudget
  budgetUsd.value = b ? String(b.usd) : ''
  budgetReset.value = b?.resetDay ? String(b.resetDay) : ''
  budgetOpen.value = true
}
async function saveBudget(remove = false) {
  budgetSaving.value = true
  try {
    await adminFetch('/api/admin/ai-settings/budget', { method: 'PUT', body: { usd: remove ? 0 : Number(String(budgetUsd.value).replace(',', '.')), resetDay: budgetReset.value || null } })
    budgetOpen.value = false
    toast.success(remove ? 'Бюджет ИИ убран' : 'Бюджет ИИ сохранён')
    await refresh()
  }
  catch (e: any) {
    toast.error(e?.data?.message || 'Не удалось сохранить бюджет')
  }
  finally {
    budgetSaving.value = false
  }
}

const left = computed(() => demand.value?.balance != null ? refreshesLeft(demand.value.balance) : null)
/** На сколько обновлений спроса хватит остатка DataForSEO — под его «батарейкой» */
const balanceLine = computed(() => {
  const n = left.value
  if (n == null)
    return null
  if (!n)
    return { text: 'не хватит ни на одно обновление — пополните баланс', warn: true }
  return { text: `хватит на ${count(n, 'обновление', 'обновления', 'обновлений')}${n < 2 ? ' — пора пополнить' : ''}`, warn: n < 2 }
})
// «Последний месяц — октябрь 2026, обновлено 3 ноября»
const demandAsOf = computed(() => {
  const until = dataUntilLabel(overview.value?.dataUntil ?? null)
  const updated = demand.value?.lastDoneAt ? `обновлено ${dayMonth(demand.value.lastDoneAt)}` : null
  const text = [until, updated].filter(Boolean).join(', ')
  return text && text[0]!.toUpperCase() + text.slice(1)
})
const nextAuto = computed(() => demand.value?.hasKey ? dayMonth(nextAutoRefresh(demand.value.lastDoneAt)) : null)

// --- Четыре цифры сверху ---
interface Tile {
  id: string
  label: string
  icon: Component
  /** Цвет плитки с иконкой */
  tone: string
  value: string
  note: string
  delta?: { text: string, pct: number } | null
}

function restockNote(r: PurchasingStatus['restock']) {
  if (!r.atThreshold)
    return 'всё выше порога остатка'
  const what = plural(r.atThreshold, 'товар', 'товара', 'товаров')
  if (!r.suppliers)
    return `${what} — все без поставщика`
  const at = `${what} у ${count(r.suppliers, 'поставщика', 'поставщиков', 'поставщиков')}`
  return r.noSupplier ? `${at}, ${r.noSupplier} без поставщика` : at
}

function offersTile(o: PurchasingStatus['offers']): Pick<Tile, 'value' | 'note'> {
  if (!o)
    return { value: '—', note: NO_MIGRATION }
  if (!o.collectedAt)
    return { value: '—', note: 'ещё не собирали' }
  return { value: String(o.fresh), note: o.fresh ? `${plural(o.fresh, 'новый товар', 'новых товара', 'новых товаров')} поставщиков` : 'всё разобрано' }
}

const tiles = computed<Tile[]>(() => {
  const s = data.value!
  const o = overview.value
  const none = o ? 'цифр ещё нет' : NO_MIGRATION
  return [
    {
      id: 'monthly',
      label: 'Спрос в месяц',
      icon: Search,
      tone: 'bg-primary/10 text-primary',
      value: hasNumbers.value ? formatVolume(o!.monthly) : '—',
      note: hasNumbers.value ? 'поисков в Google, в среднем за 3 месяца' : none,
      delta: hasNumbers.value && o?.trend != null ? { text: trendLabel(o.trend)!, pct: o.trend } : null,
    },
    {
      id: 'missing',
      label: 'Ищут, а у нас нет',
      icon: PackageX,
      tone: 'bg-red-600/10 text-red-700',
      value: hasNumbers.value ? String(o!.missing) : '—',
      note: hasNumbers.value ? `${plural(o!.missing, 'тема', 'темы', 'тем')} без наших товаров` : none,
    },
    { id: 'restock', label: 'Нужно заказать', icon: ShoppingCart, tone: 'bg-amber-100 text-amber-700', value: String(s.restock.atThreshold), note: restockNote(s.restock) },
    { id: 'offers', label: 'Не разобрано', icon: Inbox, tone: 'bg-green-100 text-green-700', ...offersTile(s.offers) },
  ]
})

// --- Что ищут: вкладки ---
type ListId = 'missing' | 'growing' | 'season' | 'volume'
const tab = ref<ListId>('missing')
const lists = computed(() => {
  const o = overview.value
  if (!o)
    return []
  return [
    { id: 'missing', label: 'Нет у нас', count: o.missing, items: o.top.missing, empty: 'Таких тем нет — по всему, что ищут, товар у нас есть.' },
    { id: 'growing', label: 'Растут', count: o.growing, items: o.top.growing, empty: 'Растущих тем нет.' },
    { id: 'season', label: 'Скоро сезон', count: o.season, items: o.top.season, empty: 'В ближайшие 2 месяца пиков нет.' },
    { id: 'volume', label: 'Больше всего ищут', count: null, items: o.top.volume, empty: '' },
  ] as const
})
const activeList = computed(() => lists.value.find(l => l.id === tab.value))

function ours(t: DemandLine) {
  return t.ourTotal ? count(t.ourTotal, 'товар', 'товара', 'товаров') : null
}
function lineNote(listId: ListId, t: DemandLine) {
  const peak = listId === 'season' ? peakLabel(t.peakMonth) : null
  return [ours(t) ?? (peak ? 'нет у нас' : null), peak].filter(Boolean).join(' · ')
}
const SPARK: Record<TrendKind, string> = { up: 'text-green-600', down: 'text-red-600', flat: 'text-neutral-500' }
const spark = (t: DemandLine) => sparkPoints(t.series?.slice(-12), 76, 24)

// --- Поставщики ---
const maxProducts = computed(() => Math.max(1, ...(data.value?.supplierLoad ?? []).map(s => s.products), data.value?.unassigned.products ?? 0))
function supplierMeta(s: SupplierLoad) {
  const parts = [count(s.products, 'товар', 'товара', 'товаров')]
  if (s.toRestock)
    parts.push(`${s.toRestock} к заказу`)
  if (s.channels) {
    const closed = s.openChannels != null ? s.channels - s.openChannels : 0
    parts.push(`${count(s.channels, 'канал', 'канала', 'каналов')}${closed ? `, ${closed} через аккаунт` : ''}`)
  }
  return parts.join(' · ')
}
const supplierSummary = computed(() => {
  const s = data.value!
  const ch = s.channels
  const who = count(s.suppliers, 'поставщик', 'поставщика', 'поставщиков')
  if (!ch)
    return `${who} · каналы — ${NO_MIGRATION}`
  return ch.total ? `${who} · ${count(ch.total, 'канал', 'канала', 'каналов')} в Telegram — у ${ch.suppliers} из ${s.suppliers}` : `${who} · каналов в Telegram ещё нет`
})

// --- Шаги ---
const steps = computed(() => data.value ? purchasingSteps(data.value) : [])
const doneCount = computed(() => steps.value.filter(s => s.state === 'done').length)

const STATE: Record<StepState, { label: string, number: string, ring: string }> = {
  done: { label: 'Готово', number: 'bg-green-100 text-green-700', ring: 'var(--primary)' },
  action: { label: 'Нужно ваше действие', number: 'bg-amber-100 text-amber-700', ring: 'rgb(254 243 198)' },
  running: { label: 'Идёт', number: 'bg-sky-100 text-sky-700', ring: 'rgb(186 230 253)' },
  later: { label: 'В разработке', number: 'bg-neutral-200 text-neutral-500', ring: 'rgb(229 229 229)' },
}
// Кольцо шагов: по отрезку на шаг, готовые — синие
const RING_R = 30
const RING_L = 2 * Math.PI * RING_R
const ringSegments = computed(() => {
  const seg = RING_L / Math.max(steps.value.length, 1)
  return steps.value.map((s, k) => ({ id: s.id, color: STATE[s.state].ring, dash: `${seg - 4} ${RING_L - seg + 4}`, offset: -k * seg }))
})
</script>

<template>
  <div class="mx-auto max-w-[1400px] space-y-4 p-4">
    <div class="flex flex-wrap items-center gap-3 px-1 pt-1.5">
      <div class="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
        <h1 class="text-[26px] font-bold leading-tight tracking-[-0.02em]">
          Умный закуп
        </h1>
        <p class="text-sm text-muted-foreground text-pretty">
          Смотрим, что ищут покупатели, и заказываем это у поставщиков
        </p>
      </div>
      <span v-if="demand?.lastDoneAt" class="text-[13px] text-muted-foreground" data-testid="purchasing-updated">
        Обновлено {{ dayMonth(demand.lastDoneAt) }}
      </span>
      <Button :disabled="pending" @click="refresh()">
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <nav class="flex flex-wrap gap-2 px-1" aria-label="Страницы умного закупа" data-testid="purchasing-pages">
      <NuxtLink
        v-for="p in PURCHASING_PAGES"
        :key="p.to"
        :to="p.to"
        class="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <component :is="PAGE_ICON[p.to]" class="h-4 w-4 text-muted-foreground" />
        {{ p.label }}
      </NuxtLink>
    </nav>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <div v-else-if="pending && !data" class="space-y-4">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="h-36 w-full rounded-[20px]" />
        </div>
        <Skeleton class="h-96 w-full rounded-[20px]" />
      </div>
      <div v-else-if="data" class="space-y-4 transition-opacity" :class="{ 'opacity-60': pending }">
        <!-- Четыре цифры -->
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="tiles-kpi">
          <div v-for="t in tiles" :key="t.id" class="flex flex-col gap-3.5 p-5" :class="CARD" :data-testid="`tile-${t.id}`">
            <div class="flex items-center gap-2.5">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-xl" :class="t.tone">
                <component :is="t.icon" class="size-5" />
              </span>
              <span class="text-sm font-medium text-muted-foreground">{{ t.label }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2.5">
              <span class="text-[30px] font-bold leading-none tracking-[-0.02em] tabular-nums" data-testid="tile-value">{{ t.value }}</span>
              <span v-if="t.delta" :class="[CHIP, trendChip(t.delta.pct)]" data-testid="tile-delta">{{ t.delta.text }}</span>
            </div>
            <span class="text-[13px] text-muted-foreground" data-testid="tile-note">{{ t.note }}</span>
          </div>
        </div>

        <!--
          Две колонки на широком экране: слева график и темы, справа шаги, поставщики
          и сервисы — иначе график стоял бы над пустым полем рядом с высокими шагами.
          Уже — одна колонка в порядке макета: обёртки `contents`, порядок — order-*.
        -->
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div class="contents xl:flex xl:min-w-0 xl:flex-[2_1_0%] xl:flex-col xl:gap-4">
            <!-- Спрос в Google -->
            <section class="order-1 flex min-w-0 flex-col gap-3 p-5 xl:order-none" :class="CARD" data-testid="demand-card">
              <div class="flex flex-wrap items-start gap-3">
                <div class="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                  <h2 class="text-base font-semibold">
                    Спрос в Google
                  </h2>
                  <span class="text-[13px] text-muted-foreground">
                    Все темы вместе, поисков в месяц<template v-if="hasNumbers && demandAsOf">. {{ demandAsOf }}</template>
                  </span>
                </div>
                <div
                  v-if="hasNumbers && (overview!.series?.length ?? 0) > 12"
                  class="inline-flex rounded-lg bg-muted p-1"
                  role="tablist"
                  aria-label="Период графика"
                  data-testid="demand-range"
                >
                  <button
                    v-for="r in [{ v: 12, label: '12 месяцев' }, { v: overview!.series!.length, label: `${overview!.series!.length / 12 === 2 ? '2 года' : `${overview!.series!.length} мес.`}` }]"
                    :key="r.v"
                    type="button"
                    role="tab"
                    class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
                    :class="range === r.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                    :aria-selected="range === r.v"
                    @click="range = r.v"
                  >
                    {{ r.label }}
                  </button>
                </div>
              </div>

              <p v-if="!demand" class="text-sm text-muted-foreground">
                Спрос заработает после миграции базы.
              </p>
              <div v-else-if="!hasNumbers" class="space-y-2 text-sm" data-testid="demand-empty">
                <p class="font-medium">
                  Цифр спроса ещё нет — {{ count(overview!.topics, 'тема', 'темы', 'тем') }} ждут первого обновления.
                </p>
                <p v-if="demand.running" class="text-muted-foreground">
                  Обновление идёт — цифры появятся, когда DataForSEO ответит.
                </p>
                <p v-else-if="!demand.hasKey" class="text-muted-foreground">
                  Задайте ключ DataForSEO на «Спросе на рынке» и нажмите «Обновить сейчас» — около {{ formatUsd(DEMAND_REFRESH_COST) }} с баланса DataForSEO.
                </p>
                <p v-else class="text-muted-foreground">
                  Нажмите «Обновить сейчас» на «Спросе на рынке» — около {{ formatUsd(DEMAND_REFRESH_COST) }} с баланса DataForSEO.
                </p>
                <p v-if="demand.lastFailed" class="text-destructive">
                  Последнее обновление не удалось — подробности на «Спросе на рынке».
                </p>
              </div>
              <template v-else>
                <div class="flex flex-wrap items-center gap-2.5">
                  <span class="text-[30px] font-bold tracking-[-0.02em] tabular-nums">{{ formatVolume(overview!.monthly) }}</span>
                  <span v-if="overview!.trend != null" :class="[CHIP, trendChip(overview!.trend)]" data-testid="demand-trend">{{ trendLabel(overview!.trend) }} за год</span>
                  <span class="text-[13px] text-muted-foreground">в среднем за 3 месяца</span>
                </div>
                <DemandChart :series="overview!.series!" :months="months" :range="range" />
              </template>
            </section>

            <!-- Что ищут -->
            <section v-if="hasNumbers" class="order-3 flex min-w-0 flex-col pt-5 pb-1.5 xl:order-none" :class="CARD" data-testid="demand-topics">
              <div class="flex flex-col gap-3.5 px-5 pb-3.5">
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-semibold">
                    Что ищут
                  </h2>
                  <span class="text-[13px] text-muted-foreground">Темы в Google, поисков в месяц</span>
                </div>
                <div class="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Темы">
                  <button
                    v-for="l in lists"
                    :key="l.id"
                    type="button"
                    role="tab"
                    class="flex-1 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors"
                    :class="tab === l.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                    :aria-selected="tab === l.id"
                    :data-testid="`demand-tab-${l.id}`"
                    @click="tab = l.id"
                  >
                    {{ l.label }}<template v-if="l.count != null">
                      · {{ l.count }}
                    </template>
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 bg-neutral-50 px-5 py-2 text-xs text-muted-foreground sm:grid-cols-[28px_minmax(0,1fr)_80px_72px_72px]">
                <span>№</span><span>Тема</span><span class="hidden sm:block">Динамика</span><span class="text-right">Поисков</span><span class="hidden text-right sm:block">За год</span>
              </div>
              <!-- Все четыре списка в разметке, на экране — выбранный -->
              <div v-for="l in lists" v-show="tab === l.id" :key="l.id" role="tabpanel" :data-testid="`demand-list-${l.id}`">
                <ul v-if="l.items.length">
                  <li
                    v-for="(t, i) in l.items"
                    :key="t.id"
                    class="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-neutral-100 px-5 py-3 sm:grid-cols-[28px_minmax(0,1fr)_80px_72px_72px]"
                    data-testid="demand-line"
                  >
                    <span class="flex size-7 items-center justify-center rounded-[10px] bg-neutral-100 text-[13px] font-semibold">{{ i + 1 }}</span>
                    <div class="flex min-w-0 flex-col items-start gap-[3px]">
                      <span class="text-sm font-semibold" data-testid="line-name">{{ t.name }}</span>
                      <span
                        v-if="!t.ourTotal && l.id !== 'season'"
                        class="inline-flex rounded-full bg-red-600/10 px-[7px] py-px text-[11px] font-semibold text-red-700"
                        data-testid="line-note"
                      >нет у нас</span>
                      <span v-else class="text-xs text-muted-foreground" data-testid="line-note">{{ lineNote(l.id, t) }}</span>
                    </div>
                    <svg v-if="t.series" width="80" height="28" viewBox="0 0 80 28" class="hidden sm:block" :class="SPARK[trendKind(t.trend) ?? 'flat']" aria-hidden="true">
                      <polyline :points="spark(t)" transform="translate(2 2)" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
                    </svg>
                    <span v-else class="hidden sm:block" />
                    <div class="flex flex-col items-end gap-1">
                      <span class="text-right text-sm font-semibold tabular-nums" data-testid="line-volume">{{ formatVolume(t.volume) }}</span>
                      <span v-if="t.trend != null" class="sm:hidden" :class="[CHIP, trendChip(t.trend)]">{{ trendLabel(t.trend) }}</span>
                    </div>
                    <!-- Прячет обёртка: у пилюли свой inline-flex, он перебил бы hidden -->
                    <span class="hidden justify-self-end sm:block">
                      <span :class="t.trend != null ? [CHIP, trendChip(t.trend)] : 'text-xs text-muted-foreground'" data-testid="line-trend">{{ trendLabel(t.trend) ?? '—' }}</span>
                    </span>
                  </li>
                </ul>
                <p v-else class="border-t border-neutral-100 px-5 py-3 text-sm text-muted-foreground">
                  {{ l.empty }}
                </p>
              </div>
              <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-neutral-100 px-5 pt-3 pb-2.5 text-sm font-medium">
                <NuxtLink
                  :to="tab === 'volume' ? '/admin/demand' : `/admin/demand?filter=${tab}`"
                  class="text-primary hover:underline"
                  data-testid="demand-list-all"
                >
                  {{ activeList?.count && activeList.count > activeList.items.length ? `Все ${activeList.count} →` : 'Все темы →' }}
                </NuxtLink>
                <span v-if="overview!.newQueries" class="text-[13px] font-normal text-muted-foreground" data-testid="demand-new-queries">
                  Новых запросов на рынке, ещё не разобранных: <b class="font-semibold text-foreground">{{ overview!.newQueries }}</b> —
                  <NuxtLink to="/admin/demand" class="text-primary hover:underline">разобрать</NuxtLink>
                </span>
              </div>
            </section>
          </div>
          <div class="contents xl:flex xl:min-w-0 xl:flex-[1_1_0%] xl:flex-col xl:gap-4">
            <!-- Что сделать сейчас -->
            <section id="steps" class="order-2 flex min-w-0 scroll-mt-4 flex-col gap-3.5 p-5 xl:order-none" :class="CARD" data-testid="steps-card">
              <div class="flex items-center gap-4">
                <div class="relative size-[76px] shrink-0" aria-hidden="true">
                  <svg width="76" height="76" viewBox="0 0 76 76" class="block -rotate-90">
                    <circle
                      v-for="s in ringSegments"
                      :key="s.id"
                      cx="38"
                      cy="38"
                      :r="RING_R"
                      fill="none"
                      :stroke="s.color"
                      stroke-width="8"
                      :stroke-dasharray="s.dash"
                      :stroke-dashoffset="s.offset"
                    />
                  </svg>
                  <span class="absolute inset-0 flex items-center justify-center text-base font-bold">{{ doneCount }}/{{ steps.length }}</span>
                </div>
                <div class="flex flex-col gap-1">
                  <h2 class="text-base font-semibold">
                    Что сделать сейчас
                  </h2>
                  <span class="text-[13px] text-muted-foreground" data-testid="purchasing-waiting">
                    {{ doneCount === steps.length ? 'Все шаги готовы — от вас ничего не нужно' : `${doneCount} из ${steps.length} шагов готово` }}
                  </span>
                </div>
              </div>

              <!-- Порядок в разметке — по шагам; на экране готовые уходят вниз строчками -->
              <ol class="flex flex-col gap-3.5" data-testid="purchasing-steps">
                <li
                  v-for="(step, i) in steps"
                  :key="step.id"
                  :data-testid="`step-${step.id}`"
                  :data-state="step.state"
                  :class="step.state === 'done' ? 'order-last flex items-start gap-2 px-1 text-[13px] text-muted-foreground' : 'flex gap-3 rounded-2xl bg-neutral-100 p-3.5'"
                >
                  <template v-if="step.state === 'done'">
                    <span class="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                      <Check class="size-3" />
                    </span>
                    <div class="min-w-0 flex-1">
                      <NuxtLink v-if="step.link" :to="step.link.to" class="font-medium text-foreground hover:text-primary" data-testid="step-link">
                        {{ step.title }}
                      </NuxtLink>
                      <span v-else class="font-medium text-foreground">{{ step.title }}</span>
                      <span class="sr-only" data-testid="step-state">{{ STATE[step.state].label }}</span>
                      <p v-if="step.facts.length" class="text-xs" data-testid="step-facts">
                        {{ step.facts.join(' · ') }}
                      </p>
                      <p v-if="step.next" class="text-xs" data-testid="step-next">
                        {{ step.next }}
                      </p>
                    </div>
                  </template>
                  <template v-else>
                    <span class="flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" :class="STATE[step.state].number">
                      {{ i + 1 }}
                    </span>
                    <div class="flex min-w-0 flex-1 flex-col items-start gap-1">
                      <span class="text-sm font-semibold">{{ step.title }}</span>
                      <span
                        :class="step.state === 'action' ? 'sr-only' : [CHIP, STATE[step.state].number, 'px-1.5 py-px text-[11px]']"
                        data-testid="step-state"
                      >{{ STATE[step.state].label }}</span>
                      <p v-if="step.next" class="text-[13px] text-muted-foreground text-pretty" data-testid="step-next">
                        {{ step.next }}
                      </p>
                      <p v-if="step.facts.length" class="text-xs text-muted-foreground/80" data-testid="step-facts">
                        {{ step.facts.join(' · ') }}
                      </p>
                      <Button v-if="step.link" size="sm" class="mt-1.5" as-child>
                        <NuxtLink :to="step.link.to" data-testid="step-link">
                          {{ step.link.label }}
                          <ArrowRight class="h-3.5 w-3.5" />
                        </NuxtLink>
                      </Button>
                    </div>
                  </template>
                </li>
              </ol>
            </section>
            <!-- Поставщики -->
            <section class="order-4 flex flex-col gap-4 p-5 xl:order-none" :class="CARD" data-testid="supplier-card">
              <div class="flex items-center gap-2">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <h2 class="text-base font-semibold">
                    Поставщики
                  </h2>
                  <span class="text-[13px] text-muted-foreground" data-testid="supplier-summary">{{ supplierSummary }}</span>
                </div>
                <NuxtLink to="/admin/suppliers" class="self-start text-[13px] font-medium text-primary hover:underline">
                  Все →
                </NuxtLink>
              </div>
              <p v-if="!data.supplierLoad.length" class="text-sm text-muted-foreground">
                Поставщиков ещё нет — добавьте на странице «Поставщики».
              </p>
              <ul v-else class="flex flex-col gap-4" data-testid="supplier-load">
                <li v-for="s in data.supplierLoad" :key="s.id" class="flex flex-col gap-2" data-testid="supplier-row">
                  <div class="flex flex-wrap justify-between gap-x-2 text-sm">
                    <span class="min-w-0 font-medium" data-testid="supplier-name">{{ s.name }}</span>
                    <span class="text-[13px] text-muted-foreground" data-testid="supplier-meta">{{ supplierMeta(s) }}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-primary/15">
                    <div class="h-full rounded-full bg-primary" :style="{ width: `${s.products / maxProducts * 100}%` }" />
                  </div>
                </li>
                <li v-if="data.unassigned.products" class="flex flex-col gap-2" data-testid="supplier-row-none">
                  <div class="flex flex-wrap justify-between gap-x-2 text-sm">
                    <span class="font-medium text-muted-foreground">Без поставщика</span>
                    <span class="text-[13px] text-muted-foreground" data-testid="supplier-meta">
                      {{ count(data.unassigned.products, 'товар', 'товара', 'товаров') }}<template v-if="data.unassigned.toRestock">
                        · {{ data.unassigned.toRestock }} к заказу
                      </template>
                    </span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div class="h-full rounded-full bg-neutral-400" :style="{ width: `${data.unassigned.products / maxProducts * 100}%` }" />
                  </div>
                </li>
              </ul>
            </section>

            <!-- Сервисы -->
            <section class="order-5 flex flex-col gap-4 p-5 xl:order-none" :class="CARD" data-testid="usage-card">
              <h2 class="text-base font-semibold">
                Сервисы
              </h2>
              <p v-if="data.meters && !data.meters.installed" class="text-xs text-muted-foreground" data-testid="batteries-no-migration">
                Расход и лимиты ИИ появятся после миграции базы 20261106120000_usage_meters.
              </p>
              <div
                v-for="b in batteries"
                :key="b.id"
                class="flex items-start gap-3"
                :data-testid="`battery-${b.id}`"
                :data-state="b.state"
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-xl" :class="BATTERY_TILE[b.state]">
                  <component :is="BATTERY_ICON[b.id]" class="size-[18px]" />
                </span>
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium">{{ b.title }}</span>
                    <span :class="[CHIP, BATTERY_TILE[b.state]]" data-testid="battery-status">{{ batteryStatus(b) }}</span>
                  </div>
                  <span class="text-[13px] text-muted-foreground">
                    <span class="font-medium text-foreground tabular-nums" data-testid="battery-value">{{ b.value }}</span><template v-if="b.reset">
                      · <span data-testid="battery-reset">{{ b.reset }}</span>
                    </template>
                  </span>
                  <div
                    v-if="b.level != null"
                    class="h-2 w-full overflow-hidden rounded-full bg-primary/15"
                    role="meter"
                    :aria-label="b.title"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-valuenow="Math.round(b.level * 100)"
                  >
                    <div class="h-full rounded-full transition-[width]" :class="BATTERY_BAR[b.state]" :style="{ width: `${Math.max(b.level > 0 ? 3 : 0, Math.round(b.level * 100))}%` }" data-testid="battery-bar" />
                  </div>
                  <p v-if="b.note" class="text-xs text-muted-foreground" data-testid="battery-note">
                    {{ b.note }}
                  </p>

                  <!-- DataForSEO: на сколько обновлений хватит, последнее и следующее -->
                  <div v-if="b.id === 'dataforseo' && demand" class="space-y-1 text-xs text-muted-foreground" data-testid="usage-dataforseo">
                    <p v-if="balanceLine" :class="balanceLine.warn ? 'font-medium text-amber-700' : ''" data-testid="usage-balance">
                      {{ balanceLine.text }}
                    </p>
                    <p>
                      Обновление — около {{ formatUsd(DEMAND_REFRESH_COST) }}. Последнее:
                      <span data-testid="usage-last">{{ demand.lastDoneAt ? `${dayMonth(demand.lastDoneAt)}${demand.lastCost != null ? ` · ${formatUsd(demand.lastCost)}` : ''}` : 'ещё не было' }}</span>.
                      Само:
                      <span data-testid="usage-next">{{ nextAuto ? `${nextAuto} — каждое 5-е число` : 'не будет, пока не задан ключ' }}</span>.
                    </p>
                    <p v-if="demand.running">
                      Обновление идёт — DataForSEO ещё не ответил.
                    </p>
                    <p v-if="demand.lastFailed" class="text-destructive">
                      Последнее обновление не удалось — подробности на «Спросе на рынке».
                    </p>
                    <Button v-if="!demand.hasKey" variant="outline" size="sm" class="mt-1" as-child>
                      <NuxtLink to="/admin/demand">
                        Задать ключ
                        <ArrowRight class="h-3.5 w-3.5" />
                      </NuxtLink>
                    </Button>
                  </div>

                  <template v-if="b.id === 'ai_budget' && data.meters.installed">
                    <form v-if="budgetOpen" class="space-y-2 border-t pt-2" data-testid="budget-form" @submit.prevent="saveBudget()">
                      <label class="block text-xs">
                        На счёте провайдера, $
                        <Input v-model="budgetUsd" inputmode="decimal" class="mt-1 h-8" placeholder="5" data-testid="budget-usd" required />
                      </label>
                      <label class="block text-xs">
                        День сброса (1–28), пусто — без сброса
                        <Input v-model="budgetReset" inputmode="numeric" class="mt-1 h-8" placeholder="без сброса" data-testid="budget-reset" />
                      </label>
                      <p class="text-xs text-muted-foreground">
                        Расход считаем с сегодняшнего дня.
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        <Button type="submit" size="sm" :disabled="budgetSaving" data-testid="budget-save">
                          Сохранить
                        </Button>
                        <Button v-if="data.meters.aiBudget" type="button" size="sm" variant="ghost" :disabled="budgetSaving" data-testid="budget-remove" @click="saveBudget(true)">
                          Убрать
                        </Button>
                        <Button type="button" size="sm" variant="ghost" :disabled="budgetSaving" @click="budgetOpen = false">
                          Отмена
                        </Button>
                      </div>
                    </form>
                    <Button v-else size="sm" variant="outline" class="self-start" data-testid="budget-edit" @click="openBudget">
                      {{ data.meters.aiBudget ? 'Изменить' : 'Задать бюджет' }}
                    </Button>
                  </template>
                </div>
              </div>

              <!-- Модель ИИ: ключи, выбранная модель, расход на чтение -->
              <div class="flex items-start gap-3" data-testid="usage-ai">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-xl" :class="!data.ai ? BATTERY_TILE.off : aiKeyState === 'ok' ? BATTERY_TILE.ok : BATTERY_TILE.empty">
                  <!-- Через :is: Nuxt на сервере выбрасывает импорт компонента, стоящего только
                       внутри ClientOnly, а Bot нужен и в PAGE_ICON — сервер падал «Bot is not defined» -->
                  <component :is="PAGE_ICON['/admin/ai']" class="size-[18px]" />
                </span>
                <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-medium">Модель ИИ</span>
                    <span :class="[CHIP, !data.ai ? BATTERY_TILE.off : aiKeyState === 'ok' ? BATTERY_TILE.ok : BATTERY_TILE.empty]">
                      {{ !data.ai ? 'Нет данных' : aiKeyState === 'ok' ? 'Ключ есть' : aiKeyState === 'other' ? 'Нет ключа модели' : 'Нет ключа' }}
                    </span>
                  </div>
                  <p v-if="!data.ai" class="text-[13px] text-muted-foreground">
                    Заработает после миграции базы.
                  </p>
                  <template v-else>
                    <p class="text-[13px] text-muted-foreground">
                      Ключи: <span class="text-foreground" data-testid="usage-ai-keys">{{ data.ai.providers.length ? data.ai.providers.map(p => p.label).join(', ') : 'не заданы' }}</span>
                    </p>
                    <p class="break-all font-mono text-xs leading-5">
                      {{ data.ai.model }}
                    </p>
                    <p class="text-xs text-muted-foreground" data-testid="usage-ai-spend">
                      <template v-if="!aiSpend">
                        появится {{ NO_MIGRATION }}
                      </template>
                      <template v-else-if="!aiSpend.posts">
                        за 30 дней чтений не было
                      </template>
                      <template v-else>
                        за 30 дней — {{ count(aiSpend.posts, 'товар', 'товара', 'товаров') }}, {{ aiSpend.cost }}
                      </template>
                    </p>
                    <Button v-if="!data.ai.providers.length" variant="outline" size="sm" class="mt-1 self-start" as-child>
                      <NuxtLink to="/admin/ai">
                        Добавить ключ
                        <ArrowRight class="h-3.5 w-3.5" />
                      </NuxtLink>
                    </Button>
                  </template>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>
