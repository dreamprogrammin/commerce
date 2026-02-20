<script setup lang="ts">
import type { Database } from '@/types'

definePageMeta({
  layout: 'admin',
})

const supabase = useSupabaseClient<Database>()

// ============================================================================
// Типы
// ============================================================================
interface SalesReport {
  total_orders: number
  turnover: number
  cost_of_goods: number
  gross_profit: number
  tax_amount: number
  tax_rate: number
  card_sum: number
  commission_amount: number
  acquiring_rate: number
  net_profit: number
  bonuses_spent: number
  online_count: number
  offline_count: number
  user_orders_count: number
  guest_orders_count: number
}

type Period = 'today' | 'week' | 'month' | 'custom'

// ============================================================================
// Состояние
// ============================================================================
const period = ref<Period>('today')
const customFrom = ref('')
const customTo = ref('')
const acquiringRate = ref(1.5)

const report = ref<SalesReport | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

// ============================================================================
// Вычисление дат периода
// ============================================================================
function getPeriodDates(p: Period): { from: Date, to: Date } {
  const now = new Date()

  // Используем алматинское время (UTC+5)
  const almaty = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Almaty' }))

  const startOfDay = new Date(almaty)
  startOfDay.setHours(0, 0, 0, 0)

  if (p === 'today') {
    const end = new Date(almaty)
    end.setHours(23, 59, 59, 999)
    return { from: startOfDay, to: end }
  }

  if (p === 'week') {
    const day = startOfDay.getDay() || 7
    const monday = new Date(startOfDay)
    monday.setDate(startOfDay.getDate() - (day - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { from: monday, to: sunday }
  }

  if (p === 'month') {
    const from = new Date(almaty.getFullYear(), almaty.getMonth(), 1)
    const to = new Date(almaty.getFullYear(), almaty.getMonth() + 1, 0, 23, 59, 59, 999)
    return { from, to }
  }

  // custom
  const from = customFrom.value ? new Date(customFrom.value) : startOfDay
  const to = customTo.value ? new Date(customTo.value + 'T23:59:59') : new Date(almaty)
  return { from, to }
}

// ============================================================================
// Загрузка отчёта
// ============================================================================
async function loadReport() {
  const { from, to } = getPeriodDates(period.value)

  if (period.value === 'custom' && (!customFrom.value || !customTo.value)) {
    error.value = 'Укажите даты периода'
    return
  }

  isLoading.value = true
  error.value = null

  try {
    // TODO: после применения миграции перегенерировать типы: supabase gen types typescript --local > types/supabase.ts
    const { data, error: rpcError } = await (supabase.rpc as Function)('get_sales_report', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_acquiring_rate: acquiringRate.value,
    })

    if (rpcError) throw rpcError
    report.value = data as SalesReport
  }
  catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Ошибка загрузки отчёта'
  }
  finally {
    isLoading.value = false
  }
}

// Загружаем при смене периода
watch([period, acquiringRate], () => {
  if (period.value !== 'custom') {
    loadReport()
  }
}, { immediate: true })

// ============================================================================
// Форматирование
// ============================================================================
function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₸'
}

function fmtNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('ru-RU').format(value)
}

function fmtPct(value: number): string {
  return value.toFixed(1) + '%'
}

const periodLabel = computed(() => {
  const labels: Record<Period, string> = {
    today: 'Сегодня',
    week: 'Эта неделя',
    month: 'Этот месяц',
    custom: 'Произвольный период',
  }
  return labels[period.value]
})

const marginPct = computed(() => {
  if (!report.value || !report.value.turnover) return null
  return ((report.value.gross_profit / report.value.turnover) * 100).toFixed(1)
})

const netMarginPct = computed(() => {
  if (!report.value || !report.value.turnover) return null
  return ((report.value.net_profit / report.value.turnover) * 100).toFixed(1)
})
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold">Отчёт по продажам</h1>
        <p class="text-sm text-muted-foreground mt-0.5">
          Оборот, прибыль, налоги — {{ periodLabel }}
        </p>
      </div>

      <!-- Обновить -->
      <Button variant="outline" size="sm" :disabled="isLoading" @click="loadReport">
        <Icon
          name="lucide:refresh-cw"
          class="w-4 h-4 mr-2"
          :class="isLoading && 'animate-spin'"
        />
        Обновить
      </Button>
    </div>

    <!-- ==============================
         Выбор периода
    ============================== -->
    <Card>
      <CardContent class="pt-4 pb-4">
        <div class="flex flex-wrap items-end gap-4">
          <!-- Кнопки периода -->
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="p in [
                { value: 'today', label: 'Сегодня' },
                { value: 'week', label: 'Неделя' },
                { value: 'month', label: 'Месяц' },
                { value: 'custom', label: 'Период' },
              ]"
              :key="p.value"
              class="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              :class="period === p.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:border-primary/50'"
              @click="period = p.value as Period"
            >
              {{ p.label }}
            </button>
          </div>

          <!-- Произвольный период -->
          <template v-if="period === 'custom'">
            <div class="flex items-center gap-2 flex-wrap">
              <Input
                v-model="customFrom"
                type="date"
                class="w-36 h-9"
              />
              <span class="text-muted-foreground text-sm">—</span>
              <Input
                v-model="customTo"
                type="date"
                class="w-36 h-9"
              />
              <Button size="sm" @click="loadReport">
                Показать
              </Button>
            </div>
          </template>

          <!-- Ставка эквайринга -->
          <div class="flex items-center gap-2 ml-auto">
            <span class="text-sm text-muted-foreground whitespace-nowrap">Эквайринг %</span>
            <Input
              v-model.number="acquiringRate"
              type="number"
              min="0"
              max="10"
              step="0.1"
              class="w-20 h-9"
            />
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Ошибка -->
    <div
      v-if="error"
      class="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive text-sm"
    >
      <Icon name="lucide:alert-circle" class="w-4 h-4 shrink-0" />
      {{ error }}
    </div>

    <!-- Скелетон загрузки -->
    <div v-if="isLoading" class="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="i in 6"
        :key="i"
        class="h-28 rounded-xl bg-muted animate-pulse"
      />
    </div>

    <!-- ==============================
         Метрики
    ============================== -->
    <template v-if="report && !isLoading">

      <!-- Строка 1: Оборот + Себестоимость + Валовая прибыль -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <Card>
          <CardContent class="pt-5 pb-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Оборот (выручка)
            </p>
            <p class="text-2xl font-bold mt-1">{{ fmt(report.turnover) }}</p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ fmtNum(report.total_orders) }} заказов
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="pt-5 pb-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Себестоимость
            </p>
            <p class="text-2xl font-bold mt-1 text-orange-500">{{ fmt(report.cost_of_goods) }}</p>
            <p class="text-xs text-muted-foreground mt-1">
              Закупочная стоимость товаров
            </p>
          </CardContent>
        </Card>

        <Card class="border-blue-200 dark:border-blue-800">
          <CardContent class="pt-5 pb-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Валовая прибыль
            </p>
            <p
              class="text-2xl font-bold mt-1"
              :class="report.gross_profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-destructive'"
            >
              {{ fmt(report.gross_profit) }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              Маржа: <span class="font-medium">{{ marginPct !== null ? marginPct + '%' : '—' }}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Строка 2: Налог + Комиссия + Чистая прибыль -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

        <Card>
          <CardContent class="pt-5 pb-5">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Налог ИПН
                </p>
                <p class="text-2xl font-bold mt-1 text-red-500">{{ fmt(report.tax_amount) }}</p>
              </div>
              <Badge variant="outline" class="text-xs mt-1">
                4% от оборота
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-2">
              СНР упрощённая декларация 2026
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="pt-5 pb-5">
            <div class="flex items-start justify-between">
              <div>
                <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Эквайринг
                </p>
                <p class="text-2xl font-bold mt-1 text-amber-500">{{ fmt(report.commission_amount) }}</p>
              </div>
              <Badge variant="outline" class="text-xs mt-1">
                {{ fmtPct(report.acquiring_rate) }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-2">
              Комиссия за карточные платежи: {{ fmt(report.card_sum) }}
            </p>
          </CardContent>
        </Card>

        <Card class="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10">
          <CardContent class="pt-5 pb-5">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Чистая прибыль
            </p>
            <p
              class="text-2xl font-bold mt-1"
              :class="report.net_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'"
            >
              {{ fmt(report.net_profit) }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              Маржа: <span class="font-medium">{{ netMarginPct !== null ? netMarginPct + '%' : '—' }}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Строка 3: Детализация -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

        <!-- Разбивка онлайн / офлайн -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">Каналы продаж</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span class="text-sm">Онлайн (сайт)</span>
              </div>
              <span class="text-sm font-semibold">{{ fmtNum(report.online_count) }} заказов</span>
            </div>
            <div class="w-full bg-muted rounded-full h-2">
              <div
                class="bg-blue-500 h-2 rounded-full transition-all"
                :style="{ width: report.total_orders ? (report.online_count / report.total_orders * 100) + '%' : '0%' }"
              />
            </div>

            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span class="text-sm">Офлайн (касса)</span>
              </div>
              <span class="text-sm font-semibold">{{ fmtNum(report.offline_count) }} заказов</span>
            </div>
            <div class="w-full bg-muted rounded-full h-2">
              <div
                class="bg-purple-500 h-2 rounded-full transition-all"
                :style="{ width: report.total_orders ? (report.offline_count / report.total_orders * 100) + '%' : '0%' }"
              />
            </div>
          </CardContent>
        </Card>

        <!-- Расчёт по налогу -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">Налоговый расчёт (СНР 2026)</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2 text-sm">
            <div class="flex justify-between py-1 border-b">
              <span class="text-muted-foreground">Объект налогообложения</span>
              <span class="font-medium">{{ fmt(report.turnover) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b">
              <span class="text-muted-foreground">ИПН (4%)</span>
              <span class="font-medium text-red-500">{{ fmt(report.tax_amount) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b text-xs text-muted-foreground">
              <span>В т.ч. в бюджет (50%)</span>
              <span>{{ fmt(report.tax_amount / 2) }}</span>
            </div>
            <div class="flex justify-between py-1 border-b text-xs text-muted-foreground">
              <span>В т.ч. работникам (50%)</span>
              <span>{{ fmt(report.tax_amount / 2) }}</span>
            </div>
            <div class="flex justify-between py-1 pt-2">
              <span class="text-muted-foreground">Комиссия эквайринга</span>
              <span class="font-medium text-amber-500">{{ fmt(report.commission_amount) }}</span>
            </div>
            <div class="flex justify-between py-1 border-t font-semibold">
              <span>Итого вычетов</span>
              <span class="text-destructive">
                {{ fmt(report.tax_amount + report.commission_amount) }}
              </span>
            </div>

            <div class="mt-3 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground space-y-1">
              <p>Форма 910.00 подаётся 2 раза в год:</p>
              <p>• I полугодие: до 15 августа (уплата до 25 авг)</p>
              <p>• II полугодие: до 15 февраля (уплата до 25 фев)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Бонусы и прочее -->
      <Card>
        <CardContent class="pt-5 pb-5">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p class="text-muted-foreground text-xs uppercase tracking-wide">Зарегистрированные</p>
              <p class="font-semibold mt-1">{{ fmtNum(report.user_orders_count) }} заказов</p>
            </div>
            <div>
              <p class="text-muted-foreground text-xs uppercase tracking-wide">Гостевые</p>
              <p class="font-semibold mt-1">{{ fmtNum(report.guest_orders_count) }} заказов</p>
            </div>
            <div>
              <p class="text-muted-foreground text-xs uppercase tracking-wide">Картой (сумма)</p>
              <p class="font-semibold mt-1">{{ fmt(report.card_sum) }}</p>
            </div>
            <div>
              <p class="text-muted-foreground text-xs uppercase tracking-wide">Бонусов списано</p>
              <p class="font-semibold mt-1 text-amber-500">{{ fmtNum(report.bonuses_spent) }}</p>
            </div>
          </div>
        </CardContent>
      </Card>

    </template>

    <!-- Пустое состояние -->
    <div
      v-if="!report && !isLoading && !error"
      class="flex flex-col items-center justify-center py-16 text-muted-foreground"
    >
      <Icon name="lucide:bar-chart-2" class="w-12 h-12 mb-3 opacity-30" />
      <p class="text-sm">Нет данных за выбранный период</p>
    </div>
  </div>
</template>
