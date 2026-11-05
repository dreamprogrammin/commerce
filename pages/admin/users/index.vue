<script setup lang="ts">
import { RefreshCw, Search } from 'lucide-vue-next'
import { matchesUserQuery } from '@/utils/adminUsers'
import { formatPrice } from '@/utils/formatPrice'

/*
 * Пользователи (30 октября 2026): кто зарегистрирован, сколько заказал и
 * сколько бонусов на счету. Клик по строке — карточка с историей заказов и
 * бонусов. Данные через серверный маршрут: историю бонусов и email чужого
 * человека RLS админу не отдаёт.
 *
 * Карточки магазина — покупатели кассы без аккаунта — в том же списке с
 * пометкой «Магазин». «Есть карточка магазина» у аккаунта — телефон совпал
 * с карточкой; объединяет владелец кнопкой в карточке аккаунта.
 */
definePageMeta({ layout: 'admin' })

interface AdminUserRow {
  id: string
  kind: 'account' | 'offline'
  offlineMatch: { id: string, name: string } | null
  name: string | null
  phone: string | null
  email: string | null
  role: string | null
  createdAt: string
  activeBonuses: number
  pendingBonuses: number
  orders: number
  cancelled: number
  spent: number
  lastOrderAt: string | null
  /** Неоформленная корзина вошедшего покупателя (31.10.2026) */
  cart: { quantity: number, total: number, updatedAt: string } | null
}

// `adminFetch`, а не `useFetch`: серверу нужен токен входа в заголовке
const { data: users, pending, error, refresh }
  = useAsyncData('admin-users', () => adminFetch<AdminUserRow[]>('/api/admin/users'), { server: false })

const query = ref('')
const onlyMatches = ref(false)
const onlyCarts = ref(false)
const matchCount = computed(() => (users.value ?? []).filter(u => u.offlineMatch).length)
const cartCount = computed(() => (users.value ?? []).filter(u => u.cart).length)
const filtered = computed(() => (users.value ?? [])
  .filter(u => !onlyMatches.value || u.offlineMatch)
  .filter(u => !onlyCarts.value || u.cart)
  .filter(u => matchesUserQuery(u, query.value)))

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Пользователи
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Покупатели, их заказы и бонусы
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="pending" @click="refresh()">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': pending }" />
        Обновить
      </Button>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div class="relative w-full max-w-md">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input v-model="query" class="pl-9" placeholder="Имя, телефон или email" />
      </div>
      <Button
        v-if="matchCount"
        :variant="onlyMatches ? 'default' : 'outline'"
        size="sm"
        @click="onlyMatches = !onlyMatches"
      >
        Ждут объединения: {{ matchCount }}
      </Button>
      <Button
        v-if="cartCount"
        :variant="onlyCarts ? 'default' : 'outline'"
        size="sm"
        @click="onlyCarts = !onlyCarts"
      >
        С корзиной: {{ cartCount }}
      </Button>
    </div>

    <ClientOnly>
      <template #fallback>
        <Skeleton class="h-40 w-full" />
      </template>
      <p v-if="error" class="text-sm text-destructive">
        Не удалось загрузить: {{ error.statusMessage || error.message }}
      </p>
      <template v-else-if="pending">
        <Skeleton v-for="i in 4" :key="i" class="h-14 w-full" />
      </template>
      <p v-else-if="!filtered.length" class="text-sm text-muted-foreground">
        {{ query ? 'Никого не нашлось.' : 'Пользователей пока нет.' }}
      </p>
      <Card v-else>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Покупатель</TableHead>
                <TableHead>Контакты</TableHead>
                <TableHead class="text-right">
                  Заказы
                </TableHead>
                <TableHead class="text-right">
                  Выкуплено
                </TableHead>
                <TableHead class="text-right">
                  Бонусы
                </TableHead>
                <TableHead class="text-right">
                  В корзине
                </TableHead>
                <TableHead>Последний заказ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="u in filtered"
                :key="u.id"
                class="cursor-pointer"
                @click="navigateTo(`/admin/users/${u.id}`)"
              >
                <TableCell>
                  <NuxtLink :to="`/admin/users/${u.id}`" class="font-medium hover:underline" @click.stop>
                    {{ u.name || 'Без имени' }}
                  </NuxtLink>
                  <Badge v-if="u.role === 'admin'" variant="secondary" class="ml-2">
                    админ
                  </Badge>
                  <Badge v-if="u.kind === 'offline'" variant="outline" class="ml-2">
                    Магазин
                  </Badge>
                  <Badge v-if="u.offlineMatch" class="ml-2 bg-amber-100 text-amber-900 hover:bg-amber-100">
                    есть карточка магазина
                  </Badge>
                  <div class="text-xs text-muted-foreground">
                    с {{ date(u.createdAt) }}
                  </div>
                </TableCell>
                <TableCell class="text-sm">
                  <div>{{ u.phone || '—' }}</div>
                  <div class="text-muted-foreground">
                    {{ u.email || '' }}
                  </div>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ u.orders }}
                  <span v-if="u.cancelled" class="text-xs text-muted-foreground">+{{ u.cancelled }} отм.</span>
                </TableCell>
                <TableCell class="text-right tabular-nums whitespace-nowrap">
                  {{ formatPrice(u.spent) }}&nbsp;₸
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ u.activeBonuses }}
                  <div v-if="u.pendingBonuses" class="text-xs text-muted-foreground">
                    +{{ u.pendingBonuses }} ждут
                  </div>
                </TableCell>
                <TableCell class="text-right tabular-nums whitespace-nowrap">
                  <template v-if="u.cart">
                    {{ formatPrice(u.cart.total) }}&nbsp;₸
                    <div class="text-xs text-muted-foreground">
                      {{ u.cart.quantity }} шт. · {{ date(u.cart.updatedAt) }}
                    </div>
                  </template>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="text-sm whitespace-nowrap">
                  {{ date(u.lastOrderAt) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ClientOnly>
  </div>
</template>
