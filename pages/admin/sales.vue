<script setup lang="ts">
import { useAdminSalesStore } from '@/stores/adminStore/adminSalesStore'

definePageMeta({
  layout: 'admin',
})

const salesStore = useAdminSalesStore()
const { sales, totalCount, currentPage, pageSize, isLoading, filters, receiptData, isLoadingReceipt } = storeToRefs(salesStore)

// --- Локальное состояние ---
const searchQuery = ref('')
const showReceiptDialog = ref(false)

// --- Инициализация ---
onMounted(() => {
  salesStore.fetchSales()
})

onUnmounted(() => {
  salesStore.reset()
})

// --- Поиск ---
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function onSearchInput() {
  if (searchTimeout)
    clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    salesStore.setFilters({ search: searchQuery.value })
  }, 400)
}

function onSearchEnter() {
  if (searchTimeout)
    clearTimeout(searchTimeout)
  salesStore.setFilters({ search: searchQuery.value })
}

// --- Фильтры ---
function setSource(source: 'online' | 'offline' | null) {
  salesStore.setFilters({ source })
}

function setStatus(status: string | null) {
  salesStore.setFilters({ status })
}

function setDateFrom(e: Event) {
  const val = (e.target as HTMLInputElement).value
  salesStore.setFilters({ dateFrom: val || null })
}

function setDateTo(e: Event) {
  const val = (e.target as HTMLInputElement).value
  salesStore.setFilters({ dateTo: val || null })
}

// --- Чек ---
async function openReceipt(orderId: string) {
  showReceiptDialog.value = true
  await salesStore.fetchReceipt(orderId)
}

function printReceipt() {
  window.print()
}

// --- Переход на возврат ---
function goToReturn(orderId: string) {
  navigateTo(`/admin/returns?order=${orderId}`)
}

// --- Пагинация ---
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)))

function prevPage() {
  if (currentPage.value > 1)
    salesStore.setPage(currentPage.value - 1)
}

function nextPage() {
  if (currentPage.value < totalPages.value)
    salesStore.setPage(currentPage.value + 1)
}

// --- Форматирование ---
function fmt(value: number): string {
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(value))} ₸`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtReceiptDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) + ' ' + new Date(dateStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortId(id: string): string {
  return id.substring(0, 8)
}

const statusLabels: Record<string, string> = {
  new: 'Новый',
  pending: 'Ожидает',
  processing: 'В обработке',
  confirmed: 'Подтверждён',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  completed: 'Завершён',
  cancelled: 'Отменён',
}

const statusVariant = (status: string) => {
  if (status === 'cancelled') return 'destructive' as const
  return 'outline' as const
}

const paymentLabels: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  kaspi: 'Kaspi',
}

const sourceLabels: Record<string, string> = {
  online: 'Онлайн',
  offline: 'Оффлайн',
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Заголовок -->
    <div>
      <h1 class="text-2xl font-bold">
        Продажи
      </h1>
      <p class="text-sm text-muted-foreground mt-0.5">
        Список всех продаж (онлайн и оффлайн) с возможностью просмотра чека
      </p>
    </div>

    <!-- Фильтры -->
    <Card>
      <CardContent class="pt-4 pb-4">
        <div class="flex flex-col gap-3">
          <!-- Первая строка: поиск + даты -->
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-[200px]">
              <label class="text-sm font-medium mb-1.5 block">Поиск</label>
              <Input
                v-model="searchQuery"
                placeholder="Телефон, имя или UUID..."
                @input="onSearchInput"
                @keydown.enter="onSearchEnter"
              />
            </div>
            <div class="w-[160px]">
              <label class="text-sm font-medium mb-1.5 block">Дата от</label>
              <Input
                type="date"
                :value="filters.dateFrom || ''"
                @change="setDateFrom"
              />
            </div>
            <div class="w-[160px]">
              <label class="text-sm font-medium mb-1.5 block">Дата до</label>
              <Input
                type="date"
                :value="filters.dateTo || ''"
                @change="setDateTo"
              />
            </div>
          </div>

          <!-- Вторая строка: источник + статус -->
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex gap-1">
              <Button
                size="sm"
                :variant="filters.source === null ? 'default' : 'outline'"
                @click="setSource(null)"
              >
                Все
              </Button>
              <Button
                size="sm"
                :variant="filters.source === 'online' ? 'default' : 'outline'"
                @click="setSource('online')"
              >
                Онлайн
              </Button>
              <Button
                size="sm"
                :variant="filters.source === 'offline' ? 'default' : 'outline'"
                @click="setSource('offline')"
              >
                Оффлайн
              </Button>
            </div>

            <Select :model-value="filters.status || 'all'" @update:model-value="(v: string) => setStatus(v === 'all' ? null : v)">
              <SelectTrigger class="w-[180px] h-9">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Все статусы
                </SelectItem>
                <SelectItem value="new">
                  Новый
                </SelectItem>
                <SelectItem value="confirmed">
                  Подтверждён
                </SelectItem>
                <SelectItem value="delivered">
                  Доставлен
                </SelectItem>
                <SelectItem value="completed">
                  Завершён
                </SelectItem>
                <SelectItem value="cancelled">
                  Отменён
                </SelectItem>
              </SelectContent>
            </Select>

            <div class="ml-auto text-sm text-muted-foreground self-center">
              Найдено: {{ totalCount }}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-3">
      <div class="h-12 rounded-lg bg-muted animate-pulse" />
      <div class="h-12 rounded-lg bg-muted animate-pulse" />
      <div class="h-12 rounded-lg bg-muted animate-pulse" />
      <div class="h-12 rounded-lg bg-muted animate-pulse" />
    </div>

    <!-- Таблица продаж -->
    <Card v-else-if="sales.length > 0">
      <CardContent class="p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b bg-muted/50">
                <th class="text-left px-4 py-3 font-medium">
                  Дата
                </th>
                <th class="text-left px-4 py-3 font-medium">
                  Клиент
                </th>
                <th class="text-left px-4 py-3 font-medium hidden md:table-cell">
                  Телефон
                </th>
                <th class="text-left px-4 py-3 font-medium">
                  Источник
                </th>
                <th class="text-left px-4 py-3 font-medium">
                  Статус
                </th>
                <th class="text-right px-4 py-3 font-medium">
                  Сумма
                </th>
                <th class="text-left px-4 py-3 font-medium hidden lg:table-cell">
                  Оплата
                </th>
                <th class="text-right px-4 py-3 font-medium">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="sale in sales"
                :key="sale.id"
                class="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td class="px-4 py-3 whitespace-nowrap">
                  {{ fmtDate(sale.created_at) }}
                </td>
                <td class="px-4 py-3">
                  <div class="max-w-[180px] truncate">
                    {{ sale.customer_name?.trim() || 'Без имени' }}
                  </div>
                </td>
                <td class="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                  {{ sale.customer_phone || '—' }}
                </td>
                <td class="px-4 py-3">
                  <Badge
                    variant="outline"
                    class="text-xs"
                    :class="sale.source === 'offline' ? 'text-violet-600 border-violet-300' : 'text-blue-600 border-blue-300'"
                  >
                    {{ sale.source === 'offline' ? 'Оффлайн' : 'Онлайн' }}
                  </Badge>
                </td>
                <td class="px-4 py-3">
                  <Badge :variant="statusVariant(sale.status)" class="text-xs">
                    {{ statusLabels[sale.status] || sale.status }}
                  </Badge>
                </td>
                <td class="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {{ fmt(sale.final_amount) }}
                </td>
                <td class="px-4 py-3 hidden lg:table-cell">
                  {{ paymentLabels[sale.payment_method] || sale.payment_method || '—' }}
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0"
                      title="Просмотр чека"
                      @click="openReceipt(sale.id)"
                    >
                      <Icon name="lucide:receipt" class="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 w-8 p-0"
                      title="Оформить возврат"
                      @click="goToReturn(sale.id)"
                    >
                      <Icon name="lucide:undo-2" class="w-4 h-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- Пустое состояние -->
    <div
      v-else
      class="flex flex-col items-center justify-center py-16 text-muted-foreground"
    >
      <Icon name="lucide:receipt" class="w-12 h-12 mb-3 opacity-30" />
      <p class="text-sm">
        Продажи не найдены
      </p>
    </div>

    <!-- Пагинация -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-3">
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage <= 1"
        @click="prevPage"
      >
        <Icon name="lucide:chevron-left" class="w-4 h-4" />
      </Button>
      <span class="text-sm text-muted-foreground">
        {{ currentPage }} / {{ totalPages }}
      </span>
      <Button
        variant="outline"
        size="sm"
        :disabled="currentPage >= totalPages"
        @click="nextPage"
      >
        <Icon name="lucide:chevron-right" class="w-4 h-4" />
      </Button>
    </div>

    <!-- Диалог чека -->
    <Dialog v-model:open="showReceiptDialog">
      <DialogContent class="max-w-md p-0 gap-0">
        <!-- Загрузка чека -->
        <div v-if="isLoadingReceipt" class="p-8 flex items-center justify-center">
          <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-muted-foreground" />
        </div>

        <!-- Содержимое чека -->
        <template v-else-if="receiptData">
          <div id="receipt-content" class="receipt-body p-6 font-mono text-xs leading-relaxed">
            <!-- Шапка -->
            <div class="text-center">
              <p class="text-sm font-bold tracking-wider">
                ═══════════════════════════
              </p>
              <p class="text-base font-bold mt-1">
                УХТЫШКА
              </p>
              <p>Магазин детских игрушек</p>
              <p class="text-sm font-bold">
                ───────────────────────────
              </p>
              <p>г. Алматы</p>
              <p>ИП Ухтышка</p>
              <p>+7 (702) 537-94-73</p>
              <p class="text-sm font-bold">
                ═══════════════════════════
              </p>
            </div>

            <!-- Информация о заказе -->
            <div class="mt-3 space-y-0.5">
              <p>
                <span class="text-muted-foreground">Чек №:</span> {{ shortId(receiptData.id) }}
              </p>
              <p>
                <span class="text-muted-foreground">Дата:</span> {{ fmtReceiptDate(receiptData.created_at) }}
              </p>
              <p>
                <span class="text-muted-foreground">Кассир:</span> Администратор
              </p>
              <p>
                <span class="text-muted-foreground">Тип:</span> {{ sourceLabels[receiptData.source] || receiptData.source }} продажа
              </p>
              <p v-if="receiptData.customer_name?.trim()">
                <span class="text-muted-foreground">Клиент:</span> {{ receiptData.customer_name.trim() }}
              </p>
            </div>

            <p class="text-sm font-bold mt-3">
              ───────────────────────────
            </p>

            <!-- Позиции -->
            <div class="mt-2 space-y-2">
              <div v-for="(item, i) in receiptData.items" :key="i">
                <p class="break-words">
                  {{ item.product_name.length > 28 ? item.product_name.substring(0, 28) + '..' : item.product_name }}
                </p>
                <div class="flex justify-between">
                  <span class="text-muted-foreground pl-2">{{ item.quantity }} x {{ fmt(item.price_per_item) }}</span>
                  <span class="font-medium">{{ fmt(item.line_total) }}</span>
                </div>
              </div>
            </div>

            <p class="text-sm font-bold mt-3">
              ───────────────────────────
            </p>

            <!-- Итоги -->
            <div class="mt-2 space-y-0.5">
              <div v-if="receiptData.bonuses_spent > 0" class="space-y-0.5">
                <div class="flex justify-between">
                  <span>Подытог:</span>
                  <span>{{ fmt(receiptData.total_amount) }}</span>
                </div>
                <div class="flex justify-between text-green-600">
                  <span>Бонусы:</span>
                  <span>-{{ fmt(receiptData.bonuses_spent) }}</span>
                </div>
                <p class="text-sm font-bold">
                  ───────────────────────────
                </p>
              </div>
              <div class="flex justify-between font-bold text-sm">
                <span>ИТОГО:</span>
                <span>{{ fmt(receiptData.final_amount) }}</span>
              </div>
            </div>

            <p class="text-sm font-bold mt-2">
              ───────────────────────────
            </p>

            <p class="mt-1">
              <span class="text-muted-foreground">Оплата:</span> {{ paymentLabels[receiptData.payment_method] || receiptData.payment_method || '—' }}
            </p>

            <!-- Бонусы начисленные -->
            <template v-if="receiptData.bonuses_awarded > 0">
              <p class="text-sm font-bold mt-2">
                ───────────────────────────
              </p>
              <div class="mt-1 text-center">
                <p class="text-green-600 font-medium">
                  Начислено бонусов: +{{ receiptData.bonuses_awarded }}
                </p>
                <p class="text-muted-foreground text-[10px]">
                  (активация через 14 дней)
                </p>
              </div>
            </template>

            <!-- Подвал -->
            <p class="text-sm font-bold mt-3">
              ───────────────────────────
            </p>
            <div class="text-center mt-2 space-y-1">
              <p>Спасибо за покупку!</p>
              <p class="text-muted-foreground">uhti.kz</p>
            </div>
            <p class="text-sm font-bold mt-2">
              ═══════════════════════════
            </p>
          </div>

          <!-- Кнопки -->
          <div class="flex gap-2 p-4 border-t print:hidden">
            <Button class="flex-1" @click="printReceipt">
              <Icon name="lucide:printer" class="w-4 h-4 mr-2" />
              Печать
            </Button>
            <Button variant="outline" class="flex-1" @click="showReceiptDialog = false">
              Закрыть
            </Button>
          </div>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style>
@media print {
  /* Скрываем всё кроме чека */
  body * {
    visibility: hidden !important;
  }

  #receipt-content,
  #receipt-content * {
    visibility: visible !important;
  }

  #receipt-content {
    position: absolute !important;
    left: 50% !important;
    top: 0 !important;
    transform: translateX(-50%) !important;
    width: 320px !important;
    padding: 0 !important;
    margin: 0 !important;
    font-size: 12px !important;
  }

  /* Убираем тени и обводки диалога */
  [role="dialog"] {
    box-shadow: none !important;
    border: none !important;
  }
}
</style>
