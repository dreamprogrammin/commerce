<script setup lang="ts">
import type { DeliveriesData, SupplierDeliveries } from '@/utils/supplierOrders'
import { CalendarDays, ChevronRight, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import DeliveryCalendar from '@/components/admin/deliveries/DeliveryCalendar.vue'
import { adminFetch } from '@/utils/adminFetch'
import { plural, pluralPositions } from '@/utils/restockOrder'
import {
  almatyDay,
  daysBetween,
  deliveryDay,
  longDay,
  ordersByDay,
  orderSummary,
  postponedText,
  supplierDeliveries,
} from '@/utils/supplierOrders'

definePageMeta({ layout: 'admin' })

/*
 * «Поставки» — список поставщиков и календарь (27 ноября 2026). Владелец
 * 26.11: «если товаров от разных поставщиков много, мы должны перейти к
 * поставщику, который доставляет нам товар; мы планируем время ожидания
 * поставки, у нас там должен быть календарь; если поставка сегодня не
 * пришла, она переносится на следующий день». Решения в окне вопросов:
 * список → страница поставщика; календарь месяца и выбор даты в нём; перенос
 * сам, с числом переносов и «сначала ждали»; только день, без времени.
 *
 * Здесь — кого ждём (сегодня, скоро, без даты, у кого только формируется) и
 * месяц: у дня — сколько поставок и от кого. Заказы, сверка и приёмка — на
 * странице поставщика `/admin/deliveries/[supplier]`.
 */

const data = ref<DeliveriesData | null>(null)
const isLoading = ref(true)
let loaded = false

async function load() {
  isLoading.value = true
  try {
    data.value = await adminFetch<DeliveriesData>('/api/admin/deliveries')
    loaded = true
  }
  catch (error: any) {
    toast.error('Не удалось загрузить поставки', { description: error.data?.message || error.message })
  }
  finally {
    isLoading.value = false
  }
}
onMounted(load)
// Страницы админки держатся в памяти (keepalive): вернулись — свежие данные
onActivated(() => {
  if (loaded && !isLoading.value)
    load()
})

const today = computed(() => data.value?.today ?? almatyDay(new Date()))
const supplierById = computed(() => new Map((data.value?.suppliers ?? []).map(s => [s.id, s])))
const supplierName = (id: string) => supplierById.value.get(id)?.name ?? 'Поставщик'

const list = computed(() => supplierDeliveries(data.value?.orders ?? [], today.value, supplierName))
const GROUPS: { key: SupplierDeliveries['group'], title: string, empty?: string }[] = [
  { key: 'today', title: 'Сегодня ждём' },
  { key: 'ahead', title: 'Скоро' },
  { key: 'nodate', title: 'Дата не указана' },
  { key: 'forming', title: 'Только формируется заказ' },
]
const groups = computed(() => GROUPS.map(g => ({ ...g, items: list.value.filter(e => e.group === g.key) })).filter(g => g.items.length))

const openOrders = computed(() => list.value.flatMap(e => e.waiting))
const byDay = computed(() => ordersByDay(openOrders.value, today.value))
const marks = computed(() => {
  const map = new Map<string, { count: number, labels: string[], late?: boolean }>()
  for (const [day, orders] of byDay.value) {
    map.set(day, {
      count: orders.length,
      labels: [...new Set(orders.map(o => supplierName(o.supplierId)))],
      late: orders.some(o => (o.postponed ?? 0) > 0 || (o.expectedAt ?? day) < day),
    })
  }
  return map
})

const selectedDay = ref<string | null>(null)
const shownDay = computed(() => selectedDay.value ?? today.value)
const dayOrders = computed(() => byDay.value.get(shownDay.value) ?? [])

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`
const todaySuppliers = computed(() => list.value.filter(e => e.group === 'today').length)
const postponedCount = computed(() => openOrders.value.filter(o => (o.postponed ?? 0) > 0 || (o.expectedAt && o.expectedAt < today.value)).length)
const formingCount = computed(() => list.value.filter(e => e.forming).length)

function whenText(e: SupplierDeliveries): string {
  if (!e.waiting.length)
    return 'заказ ещё не отправлен'
  const parts: string[] = []
  if (e.today)
    parts.push(e.today === 1 ? 'ждём сегодня' : `ждём сегодня ${e.today} ${plural(e.today, 'поставку', 'поставки', 'поставок')}`)
  else if (e.nextDay)
    parts.push(`ждём ${deliveryDay(e.nextDay)} — через ${count(daysBetween(today.value, e.nextDay), 'день', 'дня', 'дней')}`)
  else
    parts.push('дата поставки не указана')
  const more = e.waiting.length - (e.today || (e.nextDay ? 1 : 0))
  if (more > 0 && e.nextDay)
    parts.push(`ещё ${count(more, 'поставка', 'поставки', 'поставок')} позже`)
  return parts.join(' · ')
}
function unitsText(e: SupplierDeliveries): string {
  const s = e.waiting.reduce((acc, o) => {
    const sum = orderSummary(o)
    return { positions: acc.positions + sum.positions, units: acc.units + sum.units }
  }, { positions: 0, units: 0 })
  return s.positions ? `${s.positions} ${pluralPositions(s.positions)}, ${s.units} шт.` : ''
}
</script>

<template>
  <div class="container mx-auto space-y-6 p-4 md:p-8" data-testid="deliveries-page">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Поставки
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Кого ждём и когда. Нажмите на поставщика — там его заказы, сверка и «Принять». Поставка, которая не пришла в свой день,
          ночью сама переезжает на следующий.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="isLoading" @click="load">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        Обновить
      </Button>
    </div>

    <div v-if="isLoading && !data" class="space-y-3">
      <Skeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-xl" />
    </div>

    <template v-else-if="data">
      <p v-if="!data.ordersReady" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="deliveries-no-orders">
        Заказов поставщикам на базе ещё нет — раздел заработает после миграции заказов.
      </p>
      <p v-else-if="!data.ready" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="deliveries-no-migration">
        Формирующиеся заказы и даты поставки заработают после миграции базы. Принимать по заказам из «К закупке» можно уже сейчас.
      </p>
      <p v-else-if="data.rollover === false" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="deliveries-no-rollover">
        Перенос непришедших поставок на следующий день заработает после миграции базы — пока опоздавшие показываются как «опаздывает».
      </p>

      <div class="flex flex-wrap gap-2 text-sm" data-testid="deliveries-summary">
        <span class="rounded-full bg-muted px-3 py-1">Сегодня ждём: <span class="font-medium tabular-nums">{{ count(todaySuppliers, 'поставщика', 'поставщиков', 'поставщиков') }}</span></span>
        <span class="rounded-full bg-muted px-3 py-1">Всего ждём: <span class="font-medium tabular-nums">{{ count(openOrders.length, 'поставку', 'поставки', 'поставок') }}</span></span>
        <span v-if="postponedCount" class="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-900 dark:text-amber-100">Переносились: <span class="font-medium tabular-nums">{{ postponedCount }}</span></span>
        <span v-if="data.ready" class="rounded-full bg-muted px-3 py-1">Формируются: <span class="font-medium tabular-nums">{{ formingCount }}</span></span>
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <!-- Поставщики -->
        <div class="space-y-5" data-testid="deliveries-suppliers">
          <p v-if="!groups.length" class="text-sm text-muted-foreground" data-testid="deliveries-empty">
            Ни открытых, ни формирующихся заказов нет. Товар, добавленный через «На сайт» в «Товарах поставщиков», ляжет в заказ своего поставщика.
          </p>
          <section v-for="g in groups" :key="g.key" class="space-y-2" data-testid="deliveries-group" :data-group="g.key">
            <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {{ g.title }}
            </h2>
            <NuxtLink
              v-for="e in g.items"
              :key="e.supplierId"
              :to="`/admin/deliveries/${e.supplierId}`"
              class="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 md:p-4"
              data-testid="deliveries-supplier"
              :data-supplier="e.supplierId"
            >
              <div class="min-w-0 flex-1 space-y-0.5 text-sm">
                <div class="font-medium">
                  {{ supplierName(e.supplierId) }}
                </div>
                <div class="flex items-center gap-1.5" :class="e.today ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground'" data-testid="supplier-when">
                  <CalendarDays class="h-3.5 w-3.5 shrink-0" />
                  {{ whenText(e) }}
                </div>
                <div v-if="e.postponed" class="text-xs text-amber-700 dark:text-amber-400" data-testid="supplier-postponed">
                  {{ e.postponed === 1 ? 'переносилась на день' : `переносилась ${count(e.postponed, 'раз', 'раза', 'раз')}` }}
                </div>
                <div class="text-xs text-muted-foreground tabular-nums">
                  <template v-if="unitsText(e)">
                    ждём {{ unitsText(e) }}
                  </template>
                  <template v-if="e.forming">
                    {{ unitsText(e) ? ' · ' : '' }}формируется {{ orderSummary(e.forming).positions }} {{ pluralPositions(orderSummary(e.forming).positions) }}
                  </template>
                </div>
              </div>
              <ChevronRight class="h-5 w-5 shrink-0 text-muted-foreground" />
            </NuxtLink>
          </section>
        </div>

        <!-- Календарь -->
        <Card class="h-fit lg:sticky lg:top-20" data-testid="deliveries-calendar-card">
          <CardContent class="space-y-4 px-4">
            <DeliveryCalendar :today="today" :selected="shownDay" :marks="marks" labels @select="(day: string) => (selectedDay = day)" />
            <div class="space-y-2 border-t pt-3" data-testid="calendar-day-list" :data-day="shownDay">
              <div class="text-sm font-medium">
                {{ shownDay === today ? 'Сегодня, ' : '' }}{{ longDay(shownDay) }}
              </div>
              <p v-if="!dayOrders.length" class="text-sm text-muted-foreground">
                Поставок на этот день не ждём.
              </p>
              <NuxtLink
                v-for="o in dayOrders"
                :key="o.id"
                :to="`/admin/deliveries/${o.supplierId}`"
                class="block rounded-lg border p-2 text-sm hover:bg-muted/50"
                data-testid="calendar-day-order"
              >
                <div class="font-medium">
                  {{ supplierName(o.supplierId) }} · №{{ o.number }}
                </div>
                <div class="text-xs text-muted-foreground tabular-nums">
                  {{ orderSummary(o).positions }} {{ pluralPositions(orderSummary(o).positions) }}, {{ orderSummary(o).units }} шт.
                </div>
                <div v-if="postponedText(o)" class="text-xs text-amber-700 dark:text-amber-400">
                  {{ postponedText(o) }}
                </div>
              </NuxtLink>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
