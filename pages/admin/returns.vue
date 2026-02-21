<script setup lang="ts">
import type { ReturnOrderItem } from '@/stores/adminStore/adminReturnsStore'
import { useAdminReturnsStore } from '@/stores/adminStore/adminReturnsStore'

definePageMeta({
  layout: 'admin',
})

const returnsStore = useAdminReturnsStore()
const { order, isLoading, isProcessing, lastResult } = storeToRefs(returnsStore)

// --- Состояние ---
const orderIdQuery = ref('')
const selectedItems = ref<Record<string, number>>({})
const reason = ref('')
const showConfirmDialog = ref(false)

// --- Поиск заказа ---
async function searchOrder() {
  const query = orderIdQuery.value.trim()
  if (!query)
    return
  returnsStore.reset()
  selectedItems.value = {}
  reason.value = ''
  await returnsStore.loadOrder(query)
}

function toggleItem(item: ReturnOrderItem) {
  if (item.available_quantity <= 0)
    return

  if (selectedItems.value[item.product_id]) {
    delete selectedItems.value[item.product_id]
  }
  else {
    selectedItems.value[item.product_id] = item.available_quantity
  }
}

function isSelected(productId: string): boolean {
  return !!selectedItems.value[productId]
}

function updateReturnQuantity(productId: string, qty: number) {
  const item = order.value?.items.find(i => i.product_id === productId)
  if (!item)
    return

  if (qty <= 0) {
    delete selectedItems.value[productId]
    return
  }

  selectedItems.value[productId] = Math.min(qty, item.available_quantity)
}

// --- Расчёт итогов ---
const refundAmount = computed(() => {
  if (!order.value)
    return 0
  let total = 0
  for (const [productId, qty] of Object.entries(selectedItems.value)) {
    const item = order.value.items.find(i => i.product_id === productId)
    if (item)
      total += item.price_per_item * qty
  }
  return total
})

const bonusesToCancel = computed(() => {
  if (!order.value)
    return 0
  let total = 0
  for (const [productId, qty] of Object.entries(selectedItems.value)) {
    const item = order.value.items.find(i => i.product_id === productId)
    if (item)
      total += item.bonus_points_per_item * qty
  }
  return total
})

const selectedCount = computed(() => Object.keys(selectedItems.value).length)

const hasSelection = computed(() => selectedCount.value > 0)

// --- Оформление возврата ---
function confirmReturn() {
  if (!hasSelection.value)
    return
  showConfirmDialog.value = true
}

async function executeReturn() {
  if (!order.value)
    return

  const items = Object.entries(selectedItems.value).map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }))

  const result = await returnsStore.processReturn(order.value.id, items, reason.value)

  if (result) {
    showConfirmDialog.value = false
    selectedItems.value = {}
    reason.value = ''
  }
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

onUnmounted(() => {
  returnsStore.reset()
})
</script>

<template>
  <div class="p-6 space-y-6 max-w-4xl mx-auto">
    <!-- Заголовок -->
    <div>
      <h1 class="text-2xl font-bold">
        Возврат товаров
      </h1>
      <p class="text-sm text-muted-foreground mt-0.5">
        Оформление возврата позиций из заказа (в течение 14 дней)
      </p>
    </div>

    <!-- Поиск заказа -->
    <Card>
      <CardContent class="pt-4 pb-4">
        <div class="flex gap-3 items-end">
          <div class="flex-1">
            <label class="text-sm font-medium mb-1.5 block">ID заказа</label>
            <Input
              v-model="orderIdQuery"
              placeholder="Вставьте UUID заказа или гостевого заказа..."
              @keydown.enter="searchOrder"
            />
          </div>
          <Button :disabled="!orderIdQuery.trim() || isLoading" @click="searchOrder">
            <Icon
              name="lucide:search"
              class="w-4 h-4 mr-2"
              :class="isLoading && 'animate-spin'"
            />
            Найти
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Результат последнего возврата -->
    <div
      v-if="lastResult"
      class="flex items-start gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
    >
      <Icon name="lucide:check-circle" class="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
      <div class="text-sm space-y-1">
        <p class="font-medium text-green-800 dark:text-green-200">
          Возврат оформлен
        </p>
        <p class="text-green-700 dark:text-green-300">
          Позиций: {{ lastResult.items_count }} | Сумма: {{ fmt(lastResult.refund_amount) }}
          <template v-if="lastResult.bonuses_cancelled > 0">
            | Бонусов отменено: {{ lastResult.bonuses_cancelled }}
          </template>
        </p>
      </div>
    </div>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <div class="h-32 rounded-xl bg-muted animate-pulse" />
      <div class="h-48 rounded-xl bg-muted animate-pulse" />
    </div>

    <!-- Данные заказа -->
    <template v-if="order && !isLoading">
      <!-- Информация о заказе -->
      <Card>
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <CardTitle class="text-base">
              Заказ
            </CardTitle>
            <div class="flex gap-2 flex-wrap">
              <Badge :variant="order.status === 'cancelled' ? 'destructive' : 'outline'">
                {{ statusLabels[order.status] || order.status }}
              </Badge>
              <Badge variant="outline" :class="order.source === 'offline' ? 'text-violet-600 border-violet-300' : 'text-blue-600 border-blue-300'">
                {{ order.source === 'offline' ? 'Офлайн' : 'Онлайн' }}
              </Badge>
              <Badge variant="outline" :class="order.source_table === 'guest_checkouts' ? 'text-orange-600 border-orange-300' : 'text-sky-600 border-sky-300'">
                {{ order.source_table === 'guest_checkouts' ? 'Гостевой заказ' : 'Заказ пользователя' }}
              </Badge>
              <Badge v-if="order.can_return" variant="outline" class="text-green-600 border-green-300">
                Возврат доступен
              </Badge>
              <Badge v-else variant="destructive">
                Возврат недоступен
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent class="space-y-2 text-sm">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <span class="text-muted-foreground">Дата:</span>
              <p class="font-medium">
                {{ fmtDate(order.created_at) }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Клиент:</span>
              <p class="font-medium">
                {{ order.customer_name?.trim() || 'Не указан' }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Телефон:</span>
              <p class="font-medium">
                {{ order.customer_phone || '—' }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Сумма:</span>
              <p class="font-medium">
                {{ fmt(order.final_amount) }}
              </p>
            </div>
            <div v-if="order.source_table !== 'guest_checkouts'">
              <span class="text-muted-foreground">Бонусы начислены:</span>
              <p class="font-medium">
                {{ order.bonuses_awarded }}
              </p>
            </div>
            <div>
              <span class="text-muted-foreground">Дней с заказа:</span>
              <p class="font-medium">
                {{ order.days_since_order }} из 14
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Позиции заказа -->
      <Card v-if="order.can_return">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">
            Позиции для возврата
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div
              v-for="item in order.items"
              :key="item.product_id"
              class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
              :class="[
                isSelected(item.product_id) ? 'border-primary bg-primary/5' : 'border-border',
                item.available_quantity <= 0 ? 'opacity-50' : 'cursor-pointer',
              ]"
              @click="toggleItem(item)"
            >
              <!-- Чекбокс -->
              <Checkbox
                :checked="isSelected(item.product_id)"
                :disabled="item.available_quantity <= 0"
                @click.stop
                @update:checked="toggleItem(item)"
              />

              <!-- Название -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ item.product_name }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ fmt(item.price_per_item) }} / шт
                  <template v-if="item.bonus_points_per_item > 0">
                    &middot; +{{ item.bonus_points_per_item }} бонусов/шт
                  </template>
                </p>
                <p v-if="item.returned_quantity > 0" class="text-xs text-amber-600">
                  Уже возвращено: {{ item.returned_quantity }} шт
                </p>
              </div>

              <!-- Количество -->
              <div class="flex items-center gap-2 shrink-0">
                <template v-if="isSelected(item.product_id)">
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 w-8 p-0"
                    @click.stop="updateReturnQuantity(item.product_id, (selectedItems[item.product_id] || 1) - 1)"
                  >
                    -
                  </Button>
                  <span class="text-sm font-medium w-8 text-center">
                    {{ selectedItems[item.product_id] }}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 w-8 p-0"
                    @click.stop="updateReturnQuantity(item.product_id, (selectedItems[item.product_id] || 1) + 1)"
                  >
                    +
                  </Button>
                </template>
                <span class="text-xs text-muted-foreground ml-1">
                  / {{ item.available_quantity }} шт
                </span>
              </div>
            </div>
          </div>

          <!-- Причина возврата -->
          <div class="mt-4">
            <label class="text-sm font-medium mb-1.5 block">Причина возврата</label>
            <Textarea
              v-model="reason"
              placeholder="Укажите причину возврата..."
              rows="2"
            />
          </div>

          <!-- Итого и кнопка -->
          <div v-if="hasSelection" class="mt-4 pt-4 border-t">
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="space-y-1 text-sm">
                <p>
                  <span class="text-muted-foreground">Сумма возврата:</span>
                  <span class="font-semibold ml-1">{{ fmt(refundAmount) }}</span>
                </p>
                <p v-if="bonusesToCancel > 0 && order.source_table !== 'guest_checkouts'">
                  <span class="text-muted-foreground">Бонусов к отмене:</span>
                  <span class="font-semibold ml-1 text-amber-600">{{ bonusesToCancel }}</span>
                </p>
              </div>
              <Button :disabled="isProcessing" @click="confirmReturn">
                Оформить возврат
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Возврат недоступен -->
      <div
        v-else
        class="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 text-sm"
      >
        <Icon name="lucide:alert-circle" class="w-5 h-5 text-destructive shrink-0" />
        <p>
          <template v-if="order.status === 'cancelled'">
            Заказ отменён — возврат невозможен.
          </template>
          <template v-else>
            Срок возврата истёк (прошло {{ order.days_since_order }} дней из 14).
          </template>
        </p>
      </div>
    </template>

    <!-- Пустое состояние -->
    <div
      v-if="!order && !isLoading && !lastResult"
      class="flex flex-col items-center justify-center py-16 text-muted-foreground"
    >
      <Icon name="lucide:undo-2" class="w-12 h-12 mb-3 opacity-30" />
      <p class="text-sm">
        Введите ID заказа для поиска
      </p>
    </div>

    <!-- Диалог подтверждения -->
    <Dialog v-model:open="showConfirmDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Подтвердите возврат</DialogTitle>
          <DialogDescription>
            Проверьте данные возврата перед оформлением.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-3 text-sm py-2">
          <!-- Список позиций -->
          <div
            v-for="(qty, productId) in selectedItems"
            :key="productId"
            class="flex justify-between items-center"
          >
            <span class="truncate mr-2">
              {{ order?.items.find(i => i.product_id === productId)?.product_name }}
            </span>
            <span class="font-medium shrink-0">
              {{ qty }} шт &middot;
              {{ fmt((order?.items.find(i => i.product_id === productId)?.price_per_item || 0) * qty) }}
            </span>
          </div>

          <Separator />

          <div class="flex justify-between font-medium">
            <span>Сумма возврата:</span>
            <span>{{ fmt(refundAmount) }}</span>
          </div>
          <div v-if="bonusesToCancel > 0 && order?.source_table !== 'guest_checkouts'" class="flex justify-between text-amber-600">
            <span>Бонусов к отмене:</span>
            <span>{{ bonusesToCancel }}</span>
          </div>
          <div v-if="reason" class="pt-2">
            <span class="text-muted-foreground">Причина:</span>
            <p class="mt-0.5">
              {{ reason }}
            </p>
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="outline" @click="showConfirmDialog = false">
            Отмена
          </Button>
          <Button :disabled="isProcessing" @click="executeReturn">
            <Icon
              v-if="isProcessing"
              name="lucide:loader-2"
              class="w-4 h-4 mr-2 animate-spin"
            />
            Подтвердить возврат
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
