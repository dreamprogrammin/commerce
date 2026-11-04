<script setup lang="ts">
import type { Component } from 'vue'
import type { TrendKind } from '@/utils/marketDemand'
import type { DemandLine, PurchasingStatus, StepState, SupplierLoad } from '@/utils/smartPurchasing'
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-vue-next'
import DemandChart from '@/components/admin/purchasing/DemandChart.vue'
import { dataUntilLabel, DEMAND_REFRESH_COST, formatUsd, formatVolume, peakLabel, sparkPoints, trendKind, trendLabel } from '@/utils/marketDemand'
import { plural } from '@/utils/restockOrder'
import { nextAutoRefresh, PURCHASING_PAGES, purchasingSteps, refreshesLeft, seriesMonths } from '@/utils/smartPurchasing'

definePageMeta({ layout: 'admin' })

/*
 * «Умный закуп» — дашборд (3.11.2026). Владелец: «собери всё в одном месте»,
 * следом — «дашборд со всеми показателями уровня спроса и юзадж: сколько
 * осталось, сколько поставщиков загружено, — и лишнее с сайд-меню убрать».
 * Сверху цифры: спрос, поставщики, к закупке, остаток DataForSEO; ниже — спрос
 * по темам, поставщики, расход и шаги. Страницы закупа — кнопками, в боковом
 * меню их нет. Сводка — `/api/admin/purchasing`, расчёты — `utils/smartPurchasing.ts`.
 */
const { data, pending, error, refresh }
  = useAsyncData('admin-purchasing', () => adminFetch<PurchasingStatus>('/api/admin/purchasing'), { server: false })

const PAGE_ICON: Record<(typeof PURCHASING_PAGES)[number]['to'], Component> = {
  '/admin/suppliers': Truck,
  '/admin/demand': Search,
  '/admin/ai': Bot,
  '/admin/restock': ShoppingCart,
}

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })
const NO_MIGRATION = 'после миграции базы'

const demand = computed(() => data.value?.demand ?? null)
const overview = computed(() => demand.value?.overview ?? null)
const hasNumbers = computed(() => !!overview.value?.withData)
const months = computed(() => {
  const o = overview.value
  return o?.series && o.dataUntil ? seriesMonths(o.dataUntil, o.series.length) : []
})
const left = computed(() => demand.value?.balance != null ? refreshesLeft(demand.value.balance) : null)
// «Последний месяц — октябрь 2026, обновлено 3 ноября»
const demandAsOf = computed(() => {
  const until = dataUntilLabel(overview.value?.dataUntil ?? null)
  const updated = demand.value?.lastDoneAt ? `обновлено ${dayMonth(demand.value.lastDoneAt)}` : null
  const text = [until, updated].filter(Boolean).join(', ')
  return text && text[0]!.toUpperCase() + text.slice(1)
})
const nextAuto = computed(() => demand.value?.hasKey ? dayMonth(nextAutoRefresh(demand.value.lastDoneAt)) : null)

// --- Плитки ---
interface Tile {
  id: string
  label: string
  icon: Component
  value: string
  note: string
  delta?: { text: string, kind: TrendKind } | null
  warn?: string | null
}

const TREND_CLASS: Record<TrendKind, string> = { up: 'text-green-700', down: 'text-red-700', flat: 'text-muted-foreground' }
// «Ровно» — без значка: тире перед «−5%» читалось бы как второй минус
const TREND_ICON: Partial<Record<TrendKind, Component>> = { up: TrendingUp, down: TrendingDown }
function trendClass(pct: number | null) {
  const kind = trendKind(pct)
  return kind ? TREND_CLASS[kind] : 'text-muted-foreground'
}

const demandTiles = computed<Tile[]>(() => {
  const o = overview.value
  const none = o ? 'цифр ещё нет' : NO_MIGRATION
  const topics = (n: number, rest: string) => hasNumbers.value ? `${plural(n, 'тема', 'темы', 'тем')} ${rest}` : none
  const value = (n: number | undefined) => hasNumbers.value && n != null ? String(n) : '—'
  const kind = trendKind(o?.trend ?? null)
  return [
    {
      id: 'monthly',
      label: 'Спрос в месяц',
      icon: Search,
      value: hasNumbers.value ? formatVolume(o!.monthly) : '—',
      note: hasNumbers.value ? 'поисков в Google по всем темам' : none,
      delta: kind && o?.trend != null ? { text: `${trendLabel(o.trend)} к прошлому году`, kind } : null,
    },
    { id: 'missing', label: 'Ищут, а у нас нет', icon: PackageSearch, value: value(o?.missing), note: topics(o?.missing ?? 0, 'без наших товаров') },
    { id: 'growing', label: 'Растёт', icon: TrendingUp, value: value(o?.growing), note: topics(o?.growing ?? 0, '— спрос за год +15% и больше') },
    { id: 'season', label: 'Скоро сезон', icon: CalendarClock, value: value(o?.season), note: topics(o?.season ?? 0, 'с пиком в ближайшие 2 месяца') },
  ]
})

function restockNote(r: PurchasingStatus['restock']) {
  if (!r.atThreshold)
    return 'всё выше порога остатка'
  const what = plural(r.atThreshold, 'товар', 'товара', 'товаров')
  if (!r.suppliers)
    return `${what} — все без поставщика`
  const at = `${what} у ${count(r.suppliers, 'поставщика', 'поставщиков', 'поставщиков')}`
  return r.noSupplier ? `${at}, ${r.noSupplier} без поставщика` : at
}

function balanceNote(): Pick<Tile, 'note' | 'warn'> {
  const d = demand.value
  if (!d)
    return { note: NO_MIGRATION }
  if (!d.hasKey)
    return { note: 'ключ не задан' }
  if (d.balanceError)
    return { note: 'не удалось узнать' }
  if (left.value == null)
    return { note: 'DataForSEO не сообщил остаток' }
  if (!left.value)
    return { note: 'не хватит ни на одно обновление', warn: 'пополните баланс' }
  return { note: `хватит на ${count(left.value, 'обновление', 'обновления', 'обновлений')}`, warn: left.value < 2 ? 'пора пополнить' : null }
}

const supplyTiles = computed<Tile[]>(() => {
  const s = data.value!
  const ch = s.channels
  return [
    {
      id: 'suppliers',
      label: 'Поставщики',
      icon: Truck,
      value: String(s.suppliers),
      note: !ch ? `каналы — ${NO_MIGRATION}` : ch.total ? `${count(ch.total, 'канал', 'канала', 'каналов')} в Telegram — у ${ch.suppliers} из ${s.suppliers}` : 'каналов в Telegram ещё нет',
    },
    {
      id: 'products',
      label: 'Товаров от поставщиков',
      icon: Package,
      value: String(s.supplierLoad.reduce((sum, x) => sum + x.products, 0)),
      note: s.unassigned.products ? `и ${s.unassigned.products} без поставщика` : 'у всех товаров есть поставщик',
    },
    { id: 'restock', label: 'К закупке', icon: ShoppingCart, value: String(s.restock.atThreshold), note: restockNote(s.restock) },
    { id: 'balance', label: 'Остаток DataForSEO', icon: Wallet, value: demand.value?.balance != null ? formatUsd(demand.value.balance) : '—', ...balanceNote() },
  ]
})

// --- Спрос по темам ---
const lists = computed(() => {
  const o = overview.value
  if (!o)
    return []
  return [
    { id: 'missing', title: 'Ищут, а у нас нет', count: o.missing, items: o.top.missing, empty: 'Таких тем нет — по всему, что ищут, товар у нас есть.' },
    { id: 'growing', title: 'Растёт', count: o.growing, items: o.top.growing, empty: 'Растущих тем нет.' },
    { id: 'season', title: 'Скоро сезон', count: o.season, items: o.top.season, empty: 'В ближайшие 2 месяца пиков нет.' },
    { id: 'volume', title: 'Больше всего ищут', count: null, items: o.top.volume, empty: '' },
  ] as const
})

function ours(t: DemandLine) {
  if (!t.ourTotal)
    return 'у нас нет'
  return `у нас ${count(t.ourTotal, 'товар', 'товара', 'товаров')}, в наличии ${t.ourInStock}`
}
function lineNote(listId: string, t: DemandLine) {
  const peak = listId === 'season' ? peakLabel(t.peakMonth) : null
  return peak ? `${peak} · ${ours(t)}` : ours(t)
}

// --- Поставщики ---
function channelsText(s: SupplierLoad) {
  if (s.channels == null)
    return '—'
  return s.channels ? String(s.channels) : 'нет'
}

// --- Шаги ---
const steps = computed(() => data.value ? purchasingSteps(data.value) : [])

// Номера шагов, которые ждут владельца, — «1, 2 и 5»
const waiting = computed(() => steps.value.flatMap((s, i) => s.state === 'action' ? [i + 1] : []))
const waitingText = computed(() => {
  const n = waiting.value
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} и ${n.at(-1)}` : String(n[0] ?? '')
})

const STATE: Record<StepState, { label: string, badge: string, number: string }> = {
  done: { label: 'Готово', badge: 'bg-green-100 text-green-900 hover:bg-green-100', number: 'bg-green-600 text-white' },
  action: { label: 'Нужно ваше действие', badge: 'bg-amber-100 text-amber-900 hover:bg-amber-100', number: 'bg-amber-500 text-white' },
  running: { label: 'Идёт', badge: 'bg-sky-100 text-sky-900 hover:bg-sky-100', number: 'bg-sky-600 text-white' },
  later: { label: 'В разработке', badge: 'bg-muted text-muted-foreground hover:bg-muted', number: 'bg-muted text-muted-foreground' },
}
</script>

<template>
  <div class="container mx-auto max-w-6xl space-y-6 p-4 md:p-8">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Умный закуп
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Отбираем у поставщиков товары, которые ищут покупатели, и собираем из них заказ.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <nav class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" aria-label="Страницы умного закупа" data-testid="purchasing-pages">
      <Button v-for="p in PURCHASING_PAGES" :key="p.to" variant="outline" class="justify-start" as-child>
        <NuxtLink :to="p.to">
          <component :is="PAGE_ICON[p.to]" class="mr-2 h-4 w-4 text-muted-foreground" />
          {{ p.label }}
        </NuxtLink>
      </Button>
    </nav>

    <ClientOnly>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.data?.message || error.message }}
      </p>
      <div v-else-if="pending && !data" class="space-y-6">
        <div v-for="row in 2" :key="row" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="h-28 w-full" />
        </div>
        <Skeleton class="h-80 w-full" />
      </div>
      <div v-else-if="data" class="space-y-6 transition-opacity" :class="{ 'opacity-60': pending }">
        <p class="text-sm" data-testid="purchasing-waiting">
          <template v-if="waiting.length">
            Сейчас от вас нужно: {{ waiting.length > 1 ? 'шаги' : 'шаг' }} <b class="font-semibold">{{ waitingText }}</b> —
            <NuxtLink :to="{ hash: '#steps' }" class="underline underline-offset-2 hover:text-primary">
              что сделать, внизу ↓
            </NuxtLink>
          </template>
          <template v-else>
            Сейчас от вас ничего не нужно.
          </template>
        </p>

        <section v-for="row in [{ id: 'demand', title: 'Спрос в Google', tiles: demandTiles }, { id: 'supply', title: 'Поставщики и остаток', tiles: supplyTiles }]" :key="row.id" class="space-y-2">
          <h2 class="text-sm font-medium text-muted-foreground">
            {{ row.title }}
          </h2>
          <div class="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4" :data-testid="`tiles-${row.id}`">
            <Card v-for="t in row.tiles" :key="t.id" class="gap-2 py-4 md:py-5" :data-testid="`tile-${t.id}`">
              <CardHeader class="flex flex-row items-start justify-between gap-2 px-4 md:px-5">
                <CardTitle class="text-sm font-medium leading-snug">
                  {{ t.label }}
                </CardTitle>
                <component :is="t.icon" class="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardHeader>
              <CardContent class="px-4 md:px-5">
                <div class="text-2xl font-semibold" data-testid="tile-value">
                  {{ t.value }}
                </div>
                <p v-if="t.delta" class="mt-1 flex items-center gap-1 text-xs" :class="TREND_CLASS[t.delta.kind]" data-testid="tile-delta">
                  <component :is="TREND_ICON[t.delta.kind]" v-if="TREND_ICON[t.delta.kind]" class="h-3.5 w-3.5 shrink-0" />
                  {{ t.delta.text }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground" data-testid="tile-note">
                  {{ t.note }}
                </p>
                <Badge v-if="t.warn" class="mt-2 bg-amber-100 font-normal text-amber-900 hover:bg-amber-100" data-testid="tile-warn">
                  <AlertTriangle class="mr-1 h-3 w-3" />
                  {{ t.warn }}
                </Badge>
              </CardContent>
            </Card>
          </div>
        </section>

        <!-- Спрос по темам -->
        <Card data-testid="demand-card">
          <CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1.5">
              <CardTitle>Спрос по темам</CardTitle>
              <CardDescription v-if="hasNumbers">
                Поисков в Google в месяц — в среднем за 3 последних, рост — к тем же месяцам год назад. {{ demandAsOf }}.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" class="shrink-0" as-child>
              <NuxtLink to="/admin/demand">
                Все темы
                <ArrowRight class="ml-1 h-4 w-4" />
              </NuxtLink>
            </Button>
          </CardHeader>
          <CardContent>
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
            <div v-else class="space-y-8">
              <section>
                <h3 class="mb-2 text-sm font-semibold">
                  Все темы вместе, поисков в месяц
                </h3>
                <DemandChart :series="overview!.series!" :months="months" />
              </section>

              <div class="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
                <section v-for="list in lists" :key="list.id" :data-testid="`demand-list-${list.id}`">
                  <div class="flex items-baseline justify-between gap-2 border-b pb-2">
                    <h3 class="text-sm font-semibold">
                      {{ list.title }}
                      <span v-if="list.count != null" class="font-normal text-muted-foreground">· {{ list.count }}</span>
                    </h3>
                    <NuxtLink
                      v-if="list.count && list.count > list.items.length"
                      :to="`/admin/demand?filter=${list.id}`"
                      class="whitespace-nowrap text-xs text-muted-foreground hover:text-primary"
                      data-testid="demand-list-all"
                    >
                      все {{ list.count }} →
                    </NuxtLink>
                  </div>
                  <ul v-if="list.items.length" class="divide-y">
                    <li v-for="t in list.items" :key="t.id" class="flex items-center gap-3 py-2" data-testid="demand-line">
                      <!-- С переносом, не truncate: строка без переноса распирает колонку админки на телефоне -->
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium leading-snug">
                          {{ t.name }}
                        </p>
                        <p class="text-xs leading-snug text-muted-foreground">
                          {{ lineNote(list.id, t) }}
                        </p>
                      </div>
                      <svg v-if="t.series" width="64" height="20" viewBox="0 0 64 20" class="shrink-0 text-muted-foreground/70" aria-hidden="true">
                        <polyline :points="sparkPoints(t.series, 64, 20)" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
                      </svg>
                      <div class="w-16 shrink-0 text-right">
                        <div class="text-sm font-semibold tabular-nums">
                          {{ formatVolume(t.volume) }}
                        </div>
                        <div class="text-xs tabular-nums" :class="trendClass(t.trend)">
                          {{ trendLabel(t.trend) ?? '—' }}
                        </div>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="py-2 text-sm text-muted-foreground">
                    {{ list.empty }}
                  </p>
                </section>
              </div>

              <p v-if="overview!.newQueries" class="flex flex-wrap items-baseline gap-x-2 text-sm" data-testid="demand-new-queries">
                <span>Новых запросов на рынке, ещё не разобранных: <b class="font-semibold">{{ overview!.newQueries }}</b></span>
                <NuxtLink to="/admin/demand" class="text-muted-foreground underline underline-offset-2 hover:text-primary">
                  разобрать на «Спросе на рынке» →
                </NuxtLink>
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- grid-cols-1, а не просто grid: колонка minmax(0, 1fr) не даёт таблице распирать страницу на телефоне -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Поставщики -->
          <Card data-testid="supplier-card">
            <CardHeader class="flex flex-row items-start justify-between gap-3 px-4 md:px-6">
              <div class="space-y-1.5">
                <CardTitle>Поставщики</CardTitle>
                <CardDescription>Сколько их товаров на сайте, что пора заказать и где они выкладывают новинки.</CardDescription>
              </div>
              <Button variant="outline" size="sm" class="shrink-0" as-child>
                <NuxtLink to="/admin/suppliers">
                  Все
                  <ArrowRight class="ml-1 h-4 w-4" />
                </NuxtLink>
              </Button>
            </CardHeader>
            <CardContent class="px-4 md:px-6">
              <p v-if="!data.supplierLoad.length" class="text-sm text-muted-foreground">
                Поставщиков ещё нет — добавьте на странице «Поставщики».
              </p>
              <Table v-else data-testid="supplier-load">
                <TableHeader>
                  <TableRow>
                    <TableHead class="pl-0">
                      Поставщик
                    </TableHead>
                    <TableHead class="text-right">
                      Товаров
                    </TableHead>
                    <TableHead class="whitespace-normal text-right">
                      К закупке
                    </TableHead>
                    <TableHead class="pr-0 text-right">
                      Каналы
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="s in data.supplierLoad" :key="s.id" data-testid="supplier-row">
                    <TableCell class="whitespace-normal pl-0 font-medium">
                      {{ s.name }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ s.products }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ s.toRestock || '—' }}
                    </TableCell>
                    <TableCell class="pr-0 text-right tabular-nums">
                      {{ channelsText(s) }}
                      <div v-if="s.channels && s.openChannels != null && s.openChannels < s.channels" class="whitespace-normal text-xs text-muted-foreground">
                        {{ s.channels - s.openChannels }} через аккаунт
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow v-if="data.unassigned.products" class="text-muted-foreground" data-testid="supplier-row-none">
                    <TableCell class="whitespace-normal pl-0">
                      Без поставщика
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ data.unassigned.products }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ data.unassigned.toRestock || '—' }}
                    </TableCell>
                    <TableCell class="pr-0 text-right">
                      —
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <!-- Расход и остаток -->
          <Card data-testid="usage-card">
            <CardHeader>
              <CardTitle>Расход и остаток</CardTitle>
              <CardDescription>Платные сервисы умного закупа.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <section data-testid="usage-dataforseo">
                <h3 class="text-sm font-semibold">
                  DataForSEO — спрос в Google
                </h3>
                <p v-if="!demand" class="mt-2 text-sm text-muted-foreground">
                  Заработает после миграции базы.
                </p>
                <template v-else>
                  <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt class="text-muted-foreground">
                      Остаток
                    </dt>
                    <dd data-testid="usage-balance">
                      <template v-if="demand.balance != null">
                        <b class="font-semibold">{{ formatUsd(demand.balance) }}</b> — {{ left ? `хватит на ${count(left, 'обновление', 'обновления', 'обновлений')}` : 'не хватит на обновление' }}
                      </template>
                      <template v-else-if="!demand.hasKey">
                        ключ не задан
                      </template>
                      <span v-else-if="demand.balanceError" class="text-destructive">не узнать: {{ demand.balanceError }}</span>
                      <template v-else>
                        DataForSEO не сообщил
                      </template>
                    </dd>
                    <dt class="text-muted-foreground">
                      Одно обновление
                    </dt>
                    <dd>около {{ formatUsd(DEMAND_REFRESH_COST) }}</dd>
                    <dt class="text-muted-foreground">
                      Последнее
                    </dt>
                    <dd data-testid="usage-last">
                      <template v-if="demand.lastDoneAt">
                        {{ dayMonth(demand.lastDoneAt) }}<template v-if="demand.lastCost != null">
                          · {{ formatUsd(demand.lastCost) }}
                        </template>
                      </template>
                      <template v-else>
                        ещё не было
                      </template>
                    </dd>
                    <dt class="text-muted-foreground">
                      Следующее само
                    </dt>
                    <dd data-testid="usage-next">
                      {{ nextAuto ? `${nextAuto} — каждое 5-е число` : 'не будет, пока не задан ключ' }}
                    </dd>
                  </dl>
                  <p v-if="demand.running" class="mt-2 text-sm text-muted-foreground">
                    Обновление идёт — DataForSEO ещё не ответил.
                  </p>
                  <p v-if="demand.lastFailed" class="mt-2 text-sm text-destructive">
                    Последнее обновление не удалось — подробности на «Спросе на рынке».
                  </p>
                  <Button v-if="!demand.hasKey" variant="outline" size="sm" class="mt-3" as-child>
                    <NuxtLink to="/admin/demand">
                      Задать ключ
                      <ArrowRight class="ml-1 h-4 w-4" />
                    </NuxtLink>
                  </Button>
                </template>
              </section>

              <section class="border-t pt-6" data-testid="usage-ai">
                <h3 class="text-sm font-semibold">
                  Модели ИИ — чтение постов поставщиков
                </h3>
                <p v-if="!data.ai" class="mt-2 text-sm text-muted-foreground">
                  Заработает после миграции базы.
                </p>
                <template v-else>
                  <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt class="text-muted-foreground">
                      Ключи
                    </dt>
                    <dd data-testid="usage-ai-keys">
                      {{ data.ai.providers.length ? data.ai.providers.map(p => p.label).join(', ') : 'не заданы' }}
                    </dd>
                    <dt class="text-muted-foreground">
                      Модель
                    </dt>
                    <dd class="break-all font-mono text-xs leading-5">
                      {{ data.ai.model }}
                    </dd>
                    <dt class="text-muted-foreground">
                      Расход
                    </dt>
                    <dd>появится, когда заработает чтение постов</dd>
                  </dl>
                  <Button v-if="!data.ai.providers.length" variant="outline" size="sm" class="mt-3" as-child>
                    <NuxtLink to="/admin/ai">
                      Добавить ключ
                      <ArrowRight class="ml-1 h-4 w-4" />
                    </NuxtLink>
                  </Button>
                </template>
              </section>
            </CardContent>
          </Card>
        </div>

        <!-- Шаги -->
        <Card id="steps" class="scroll-mt-4" data-testid="steps-card">
          <CardHeader>
            <CardTitle>Шаги</CardTitle>
            <CardDescription>Отбор товаров по спросу — по порядку: что готово и что ждёт вас.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol class="divide-y" data-testid="purchasing-steps">
              <li
                v-for="(step, i) in steps"
                :key="step.id"
                class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start"
                :data-testid="`step-${step.id}`"
                :data-state="step.state"
              >
                <div class="flex min-w-0 flex-1 gap-3">
                  <span
                    class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    :class="STATE[step.state].number"
                  >
                    {{ i + 1 }}
                  </span>
                  <div class="min-w-0 flex-1 space-y-1">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 class="font-semibold leading-tight">
                        {{ step.title }}
                      </h3>
                      <Badge :class="STATE[step.state].badge" data-testid="step-state">
                        {{ STATE[step.state].label }}
                      </Badge>
                    </div>
                    <p v-if="step.facts.length" class="text-xs text-muted-foreground" data-testid="step-facts">
                      {{ step.facts.join(' · ') }}
                    </p>
                    <p
                      v-if="step.next"
                      class="text-sm"
                      :class="step.state === 'action' ? 'font-medium' : 'text-muted-foreground'"
                      data-testid="step-next"
                    >
                      {{ step.next }}
                    </p>
                  </div>
                </div>
                <Button v-if="step.link" variant="outline" size="sm" class="ml-10 self-start sm:ml-0" as-child>
                  <NuxtLink :to="step.link.to" data-testid="step-link">
                    {{ step.link.label }}
                    <ArrowRight class="ml-1 h-4 w-4" />
                  </NuxtLink>
                </Button>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </ClientOnly>
  </div>
</template>
