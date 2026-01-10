<script setup lang="ts">
import { ArrowDownCircle, ArrowUpCircle, Clock, Gift, XCircle } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

// UI Components
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProfileStore } from '@/stores/core/profileStore'

// Page metadata
definePageMeta({
  layout: 'profile',
})
useHead({ title: 'История бонусов' })

// Stores
const profileStore = useProfileStore()
const { profile, bonusBalance, pendingBonuses } = storeToRefs(profileStore)

// Supabase
const supabase = useSupabaseClient()

// State
const transactions = ref<any[]>([])
const isLoading = ref(false)

// Загрузка истории бонусов
async function loadBonusHistory() {
  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('get_bonus_history', {
      p_limit: 50,
      p_offset: 0,
    })

    if (error) throw error

    transactions.value = data || []
  } catch (error: any) {
    console.error('[Bonus History] Error loading:', error)
    toast.error('Ошибка загрузки истории', {
      description: error.message,
    })
  } finally {
    isLoading.value = false
  }
}

// Форматирование даты
function formatDate(dateString: string) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Форматирование даты активации
function formatActivationDate(dateString: string | null) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

// Получение иконки для типа транзакции
function getTransactionIcon(type: string) {
  switch (type) {
    case 'earned':
      return ArrowUpCircle
    case 'spent':
      return ArrowDownCircle
    case 'welcome':
      return Gift
    case 'refund_spent':
      return ArrowUpCircle
    case 'refund_earned':
      return XCircle
    case 'activation':
      return Clock
    default:
      return Clock
  }
}

// Получение цвета для типа транзакции
function getTransactionColor(type: string) {
  switch (type) {
    case 'earned':
    case 'welcome':
    case 'refund_spent':
      return 'text-green-600'
    case 'spent':
    case 'refund_earned':
      return 'text-red-600'
    case 'activation':
      return 'text-blue-600'
    default:
      return 'text-muted-foreground'
  }
}

// Получение названия типа транзакции
function getTransactionName(type: string) {
  const names: Record<string, string> = {
    earned: 'Начислено за покупку',
    spent: 'Потрачено на покупку',
    welcome: 'Приветственный бонус',
    refund_spent: 'Возврат бонусов',
    refund_earned: 'Отмена начисления',
    activation: 'Активация бонусов',
  }
  return names[type] || type
}

// Получение варианта badge для статуса
function getStatusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'default'
    case 'pending':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline'
  }
}

// Получение названия статуса
function getStatusName(status: string) {
  const names: Record<string, string> = {
    completed: 'Завершено',
    pending: 'Ожидает активации',
    cancelled: 'Отменено',
  }
  return names[status] || status
}

// Инициализация
onMounted(() => {
  loadBonusHistory()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Заголовок -->
    <div>
      <h1 class="text-2xl font-bold tracking-tight">
        История бонусов
      </h1>
      <p class="text-muted-foreground">
        Следите за начислениями и тратами ваших бонусов
      </p>
    </div>

    <!-- Карточки с балансом -->
    <div class="grid gap-4 md:grid-cols-2">
      <!-- Активные бонусы -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            Доступные бонусы
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold">{{ bonusBalance.toLocaleString('ru-RU') }}</span>
            <span class="text-muted-foreground">₸</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Можно использовать прямо сейчас
          </p>
        </CardContent>
      </Card>

      <!-- Pending бонусы -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            Ожидают активации
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold">{{ pendingBonuses.toLocaleString('ru-RU') }}</span>
            <span class="text-muted-foreground">₸</span>
          </div>
          <p class="mt-2 text-sm text-muted-foreground">
            Станут доступны через 7 дней после начисления
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- История транзакций -->
    <Card>
      <CardHeader>
        <CardTitle>История операций</CardTitle>
        <CardDescription>
          Полная история начислений и трат бонусов
        </CardDescription>
      </CardHeader>
      <CardContent>
        <!-- Загрузка -->
        <div v-if="isLoading" class="space-y-3">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>

        <!-- Пустое состояние -->
        <div v-else-if="transactions.length === 0" class="flex flex-col items-center justify-center py-12 text-center">
          <Clock class="h-12 w-12 text-muted-foreground mb-4" />
          <h3 class="text-lg font-semibold">
            История пока пуста
          </h3>
          <p class="text-sm text-muted-foreground mt-2">
            Совершите первую покупку, чтобы начать зарабатывать бонусы
          </p>
        </div>

        <!-- Таблица транзакций -->
        <div v-else class="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Операция</TableHead>
                <TableHead class="text-right">
                  Сумма
                </TableHead>
                <TableHead>Статус</TableHead>
                <TableHead class="text-right">
                  Баланс после
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="transaction in transactions" :key="transaction.id">
                <!-- Дата -->
                <TableCell class="font-medium">
                  {{ formatDate(transaction.created_at) }}
                </TableCell>

                <!-- Операция -->
                <TableCell>
                  <div class="flex items-center gap-2">
                    <component
                      :is="getTransactionIcon(transaction.transaction_type)"
                      :class="['h-4 w-4', getTransactionColor(transaction.transaction_type)]"
                    />
                    <div>
                      <div class="font-medium">
                        {{ getTransactionName(transaction.transaction_type) }}
                      </div>
                      <div v-if="transaction.description" class="text-sm text-muted-foreground">
                        {{ transaction.description }}
                      </div>
                      <div v-if="transaction.activation_date && transaction.status === 'pending'" class="text-sm text-muted-foreground">
                        Активация: {{ formatActivationDate(transaction.activation_date) }}
                      </div>
                    </div>
                  </div>
                </TableCell>

                <!-- Сумма -->
                <TableCell class="text-right">
                  <span
                    :class="[
                      'font-semibold',
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    ]"
                  >
                    {{ transaction.amount > 0 ? '+' : '' }}{{ transaction.amount.toLocaleString('ru-RU') }} ₸
                  </span>
                </TableCell>

                <!-- Статус -->
                <TableCell>
                  <Badge :variant="getStatusVariant(transaction.status)">
                    {{ getStatusName(transaction.status) }}
                  </Badge>
                </TableCell>

                <!-- Баланс после -->
                <TableCell class="text-right">
                  <div class="flex flex-col items-end">
                    <span class="font-medium">{{ transaction.balance_after.toLocaleString('ru-RU') }} ₸</span>
                    <span v-if="transaction.pending_balance_after > 0" class="text-sm text-muted-foreground">
                      (+{{ transaction.pending_balance_after.toLocaleString('ru-RU') }} в ожидании)
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
