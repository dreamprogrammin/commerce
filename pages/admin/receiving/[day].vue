<script setup lang="ts">
import type { DeliveriesData } from '@/utils/supplierOrders'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { adminFetch } from '@/utils/adminFetch'
import { dayReceipts, daySuppliers, parseDay } from '@/utils/receivingDay'
import { pluralPositions } from '@/utils/restockOrder'
import { addDays, almatyDay, deliveryDay, longDay, orderSummary, postponedText } from '@/utils/supplierOrders'

definePageMeta({ layout: 'admin' })

/*
 * День «Приёмки товаров» (28 ноября 2026) — поставщики, которых ждём в этот
 * день, и что за день уже принято. Сюда ведёт календарь `/admin/receiving`.
 *
 * День берётся из адреса один раз: страницы админки держатся в памяти
 * (keepalive), и `useRoute()` у спрятанной страницы живой — ушли на другую,
 * а день бы поменялся у неё в фоне.
 */
const day = parseDay(useRoute().params.day)

const data = ref<DeliveriesData | null>(null)
const isLoading = ref(true)

async function load() {
  if (!day) {
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    data.value = await adminFetch<DeliveriesData>('/api/admin/deliveries')
  }
  catch (error: any) {
    toast.error('Не удалось загрузить поставки', { description: error.data?.message || error.message })
  }
  finally {
    isLoading.value = false
  }
}
useRefreshOnReturn(load)

const today = computed(() => data.value?.today ?? almatyDay(new Date()))
const supplierName = (id: string) => data.value?.suppliers.find(s => s.id === id)?.name ?? 'Поставщик'
const suppliers = computed(() => day && data.value ? daySuppliers(data.value.orders, day, today.value, supplierName) : [])
const received = computed(() => day && data.value ? dayReceipts(data.value.receipts, data.value.orders, day, supplierName) : [])

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })
const numbers = (list: number[]) => list.map(n => `№${n}`).join(', ')
</script>

<template>
  <div class="container mx-auto max-w-3xl space-y-6 p-4 md:p-8" data-testid="receiving-day-page" :data-day="day ?? ''">
    <p v-if="!day" class="text-sm text-muted-foreground" data-testid="receiving-day-invalid">
      Такой даты нет.
      <NuxtLink to="/admin/receiving" class="underline">
        К календарю
      </NuxtLink>
    </p>

    <template v-else>
      <div class="space-y-3">
        <div class="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 class="text-2xl font-bold tracking-tight md:text-3xl" data-testid="receiving-day-title">
              {{ day === today ? 'Сегодня, ' : '' }}{{ longDay(day) }}
            </h1>
          </div>
          <Button variant="outline" size="sm" :disabled="isLoading" @click="load">
            <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
            Обновить
          </Button>
        </div>
        <nav class="flex flex-wrap items-center gap-2" aria-label="Другой день" data-testid="receiving-day-nav">
          <Button variant="outline" size="sm" as-child>
            <NuxtLink :to="`/admin/receiving/${addDays(day, -1)}`" data-testid="receiving-day-prev">
              <ChevronLeft class="mr-1 h-4 w-4" />
              {{ deliveryDay(addDays(day, -1)) }}
            </NuxtLink>
          </Button>
          <Button variant="outline" size="sm" as-child>
            <NuxtLink to="/admin/receiving" data-testid="receiving-day-calendar">
              <CalendarDays class="mr-1 h-4 w-4" />
              Календарь
            </NuxtLink>
          </Button>
          <Button variant="outline" size="sm" as-child>
            <NuxtLink :to="`/admin/receiving/${addDays(day, 1)}`" data-testid="receiving-day-next">
              {{ deliveryDay(addDays(day, 1)) }}
              <ChevronRight class="ml-1 h-4 w-4" />
            </NuxtLink>
          </Button>
          <Button v-if="data && day !== today" variant="ghost" size="sm" as-child>
            <NuxtLink :to="`/admin/receiving/${today}`" data-testid="receiving-day-today">
              Сегодня
            </NuxtLink>
          </Button>
        </nav>
      </div>

      <div v-if="isLoading && !data" class="space-y-3">
        <Skeleton v-for="i in 3" :key="i" class="h-24 w-full rounded-xl" />
      </div>

      <template v-else-if="data">
        <p v-if="!data.ordersReady" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="receiving-no-orders">
          Заказов поставщикам на базе ещё нет — раздел заработает после миграции заказов.
        </p>
        <p v-else-if="!data.ready" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="receiving-no-dates">
          Даты поставок заработают после миграции базы — пока ни на один день поставок нет.
        </p>

        <section class="space-y-2" data-testid="receiving-day-suppliers">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ждём
          </h2>
          <p v-if="!suppliers.length" class="text-sm text-muted-foreground" data-testid="receiving-day-empty">
            На этот день поставок не ждём.<template v-if="day < today">
              Опоздавшие поставки — в сегодняшнем дне.
            </template>
          </p>
          <div
            v-for="s in suppliers"
            :key="s.supplierId"
            class="space-y-2 rounded-xl border bg-card p-3 md:p-4"
            data-testid="receiving-supplier"
            :data-supplier="s.supplierId"
          >
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span class="font-medium" data-testid="receiving-supplier-name">{{ s.name }}</span>
              <span v-if="s.late" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900 dark:text-amber-100" data-testid="receiving-supplier-late">
                опаздывает
              </span>
            </div>
            <ul class="space-y-0.5 text-sm text-muted-foreground tabular-nums">
              <li v-for="o in s.orders" :key="o.id" data-testid="receiving-supplier-order" :data-order="o.id">
                №{{ o.number }} · {{ orderSummary(o).positions }} {{ pluralPositions(orderSummary(o).positions) }}, {{ orderSummary(o).units }} шт.
                <span v-if="postponedText(o)" class="text-amber-700 dark:text-amber-400"> · {{ postponedText(o) }}</span>
              </li>
            </ul>
            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span v-if="s.waiting < s.units" class="text-muted-foreground tabular-nums" data-testid="receiving-supplier-waiting">
                часть уже принята — ждём ещё {{ s.waiting }} шт.
              </span>
              <NuxtLink :to="`/admin/deliveries/${s.supplierId}`" class="ml-auto inline-flex items-center gap-1 text-primary hover:underline" data-testid="receiving-supplier-link">
                Заказы поставщика
                <ChevronRight class="h-4 w-4" />
              </NuxtLink>
            </div>
          </div>
        </section>

        <section v-if="received.length" class="space-y-2" data-testid="receiving-day-received">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Принято в этот день
          </h2>
          <div
            v-for="r in received"
            :key="r.supplierId"
            class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border bg-card p-3 text-sm md:p-4"
            data-testid="receiving-received"
            :data-supplier="r.supplierId"
          >
            <span class="font-medium">{{ r.name }}</span>
            <span class="text-muted-foreground tabular-nums">
              {{ numbers(r.numbers) }} · {{ r.positions }} {{ pluralPositions(r.positions) }}, {{ r.units }} шт. · в {{ time(r.lastAt) }}
            </span>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
