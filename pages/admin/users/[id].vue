<script setup lang="ts">
import { ArrowLeft, RefreshCw } from 'lucide-vue-next'
import { formatPrice } from '@/utils/formatPrice'

/*
 * Карточка покупателя (30 октября 2026): контакты, все заказы с составом —
 * с сайта и из кассы — и история бонусов.
 */
definePageMeta({ layout: 'admin' })

interface AdminUserOrder {
  id: string
  number: number | null
  createdAt: string
  status: string
  source: string | null
  total: number
  bonusesSpent: number
  bonusesAwarded: number
  deliveryMethod: string | null
  paymentMethod: string | null
  items: { name: string, slug: string | null, quantity: number, price: number }[]
}

interface AdminUserBonus {
  id: string
  createdAt: string
  type: string
  amount: number
  balanceAfter: number | null
  status: string | null
  description: string | null
  orderId: string | null
  activationDate: string | null
}

interface AdminUserDetail {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  role: string | null
  createdAt: string
  activeBonuses: number
  pendingBonuses: number
  summary: { orders: number, cancelled: number, spent: number, lastOrderAt: string | null }
  orders: AdminUserOrder[]
  bonuses: AdminUserBonus[]
}

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data: user, pending, error, refresh }
  = useAsyncData(() => `admin-user-${id.value}`, () => adminFetch<AdminUserDetail>(`/api/admin/users/${id.value}`), { server: false })

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

const sourceLabels: Record<string, string> = {
  web: 'Сайт',
  offline: 'Касса',
}

const bonusTypeLabels: Record<string, string> = {
  earned: 'За заказ',
  pending: 'За заказ, ждёт активации',
  activation: 'Активация',
  spent: 'Списание за заказ',
  welcome: 'Приветственные',
  review: 'За отзыв',
  birthday: 'Ко дню рождения',
  refund_spent: 'Возврат списанных',
  refund_earned: 'Отмена начисления',
  rollback_earned: 'Отмена начисления',
  expiration: 'Сгорели',
}

function dateTime(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <div class="flex items-center justify-between gap-4">
      <Button variant="ghost" size="sm" as-child>
        <NuxtLink to="/admin/users">
          <ArrowLeft class="w-4 h-4 mr-2" />
          Все пользователи
        </NuxtLink>
      </Button>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <ClientOnly>
      <template #fallback>
        <Skeleton class="h-40 w-full" />
      </template>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.statusMessage || error.message }}
      </p>
      <Skeleton v-else-if="pending || !user" class="h-40 w-full" />
      <template v-else>
        <Card>
          <CardHeader>
            <CardTitle class="flex flex-wrap items-center gap-2">
              {{ user.name || 'Без имени' }}
              <Badge v-if="user.role === 'admin'" variant="secondary">
                админ
              </Badge>
            </CardTitle>
            <CardDescription class="flex flex-wrap gap-x-4 gap-y-1">
              <a v-if="user.phone" :href="phoneHref(user.phone)" class="text-primary hover:underline">{{ user.phone }}</a>
              <span v-else>телефона нет</span>
              <a v-if="user.email" :href="`mailto:${user.email}`" class="text-primary hover:underline">{{ user.email }}</a>
              <span>на сайте с {{ dateTime(user.createdAt) }}</span>
            </CardDescription>
          </CardHeader>
          <CardContent class="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div class="text-xs text-muted-foreground">
                Заказов
              </div>
              <div class="text-xl font-semibold tabular-nums">
                {{ user.summary.orders }}
                <span v-if="user.summary.cancelled" class="text-sm font-normal text-muted-foreground">+{{ user.summary.cancelled }} отм.</span>
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                Выкуплено
              </div>
              <div class="text-xl font-semibold tabular-nums whitespace-nowrap">
                {{ formatPrice(user.summary.spent) }}&nbsp;₸
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                Бонусы доступны
              </div>
              <div class="text-xl font-semibold tabular-nums">
                {{ user.activeBonuses }}
              </div>
            </div>
            <div>
              <div class="text-xs text-muted-foreground">
                Бонусы ждут активации
              </div>
              <div class="text-xl font-semibold tabular-nums">
                {{ user.pendingBonuses }}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Заказы</CardTitle>
            <CardDescription>С сайта и из кассы, новые сверху</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="!user.orders.length" class="text-sm text-muted-foreground">
              Заказов нет.
            </p>
            <div v-for="order in user.orders" :key="order.id" class="rounded-lg border p-4 space-y-2">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <div class="font-semibold">
                  {{ order.number ? `№ ${order.number}` : order.id.slice(0, 8) }}
                  <span class="font-normal text-sm text-muted-foreground">· {{ dateTime(order.createdAt) }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <Badge variant="outline">
                    {{ sourceLabels[order.source ?? ''] ?? order.source ?? '—' }}
                  </Badge>
                  <Badge :variant="order.status === 'cancelled' ? 'destructive' : 'outline'">
                    {{ statusLabels[order.status] ?? order.status }}
                  </Badge>
                  <span class="font-semibold tabular-nums whitespace-nowrap">{{ formatPrice(order.total) }}&nbsp;₸</span>
                </div>
              </div>
              <p v-if="!order.items.length" class="text-sm text-muted-foreground">
                Состав заказа не сохранился.
              </p>
              <ul v-else class="text-sm space-y-0.5">
                <li v-for="(item, j) in order.items" :key="j">
                  <NuxtLink v-if="item.slug" :to="`/catalog/products/${item.slug}`" target="_blank" class="hover:underline">
                    {{ item.name }}
                  </NuxtLink>
                  <span v-else>{{ item.name }}</span>
                  — {{ item.quantity }} шт. × {{ formatPrice(item.price) }}&nbsp;₸
                </li>
              </ul>
              <div v-if="order.bonusesSpent || order.bonusesAwarded" class="text-xs text-muted-foreground">
                <span v-if="order.bonusesSpent">Списано бонусов: {{ order.bonusesSpent }}. </span>
                <span v-if="order.bonusesAwarded">Начислено: {{ order.bonusesAwarded }}.</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>История бонусов</CardTitle>
          </CardHeader>
          <CardContent>
            <p v-if="!user.bonuses.length" class="text-sm text-muted-foreground">
              Операций с бонусами не было.
            </p>
            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>Когда</TableHead>
                  <TableHead>Операция</TableHead>
                  <TableHead class="text-right">
                    Сумма
                  </TableHead>
                  <TableHead class="text-right">
                    Баланс после
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="b in user.bonuses" :key="b.id">
                  <TableCell class="text-sm whitespace-nowrap">
                    {{ dateTime(b.createdAt) }}
                  </TableCell>
                  <TableCell class="text-sm">
                    {{ bonusTypeLabels[b.type] ?? b.type }}
                    <div v-if="b.description" class="text-xs text-muted-foreground">
                      {{ b.description }}
                    </div>
                  </TableCell>
                  <TableCell class="text-right tabular-nums" :class="b.amount < 0 ? 'text-destructive' : 'text-green-700'">
                    {{ b.amount > 0 ? '+' : '' }}{{ b.amount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ b.balanceAfter ?? '—' }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </template>
    </ClientOnly>
  </div>
</template>
