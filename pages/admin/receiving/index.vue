<script setup lang="ts">
import type { DeliveriesData } from '@/utils/supplierOrders'
import { ChevronRight, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import DeliveryCalendar from '@/components/admin/deliveries/DeliveryCalendar.vue'
import { adminFetch } from '@/utils/adminFetch'
import { dayMarks } from '@/utils/receivingDay'
import { plural } from '@/utils/restockOrder'
import { almatyDay, longDay } from '@/utils/supplierOrders'

definePageMeta({ layout: 'admin' })

/*
 * «Приёмка товаров» (28 ноября 2026). Владелец: «я захожу в раздел „Приёмка
 * товаров“, далее выбираю дату по календарю — на сегодня календарь ставит по
 * умолчанию сегодня, или можно выбрать любую дату, чтобы посмотреть, какие
 * поставки ожидаются; когда выбираю дату, открывается следующая страница, где
 * уже лежит список поставщиков». Здесь — календарь: сегодня выбрано, нажатие
 * на день открывает его страницу `/admin/receiving/[day]`.
 */
const data = ref<DeliveriesData | null>(null)
const isLoading = ref(true)

async function load() {
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
// Страницы админки держатся в памяти (keepalive): вернулись — свежие данные
useRefreshOnReturn(load)

const today = computed(() => data.value?.today ?? almatyDay(new Date()))
const supplierName = (id: string) => data.value?.suppliers.find(s => s.id === id)?.name ?? 'Поставщик'
const marks = computed(() => dayMarks(data.value?.orders ?? [], today.value, supplierName))
const todayCount = computed(() => marks.value.get(today.value)?.count ?? 0)

function open(day: string) {
  void navigateTo(`/admin/receiving/${day}`)
}
</script>

<template>
  <div class="container mx-auto max-w-3xl space-y-6 p-4 md:p-8" data-testid="receiving-page">
    <div class="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 class="text-2xl font-bold tracking-tight md:text-3xl">
          Приёмка товаров
        </h1>
        <p class="mt-1 max-w-2xl text-sm text-muted-foreground">
          Выберите день — откроется список поставщиков, которых ждём. Сегодня уже выбрано.
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="isLoading" @click="load">
        <RefreshCw class="mr-2 h-4 w-4" :class="{ 'animate-spin': isLoading }" />
        Обновить
      </Button>
    </div>

    <p v-if="data && !data.ordersReady" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="receiving-no-orders">
      Заказов поставщикам на базе ещё нет — раздел заработает после миграции заказов.
    </p>
    <p v-else-if="data && !data.ready" class="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="receiving-no-dates">
      Даты поставок заработают после миграции базы — пока в календаре пусто.
    </p>

    <Card data-testid="receiving-calendar-card">
      <CardContent class="space-y-4 px-4">
        <Skeleton v-if="isLoading && !data" class="h-80 w-full rounded-lg" />
        <DeliveryCalendar v-else :today="today" :selected="today" :marks="marks" labels @select="open" />
        <Button class="w-full justify-between" size="lg" data-testid="receiving-open-today" @click="open(today)">
          <span class="truncate">
            Сегодня, {{ longDay(today) }}<template v-if="data">
              — {{ todayCount ? `ждём ${todayCount} ${plural(todayCount, 'поставщика', 'поставщиков', 'поставщиков')}` : 'поставок не ждём' }}
            </template>
          </span>
          <ChevronRight class="h-5 w-5 shrink-0" />
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
