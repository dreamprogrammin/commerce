<script setup lang="ts">
import { ArrowLeft, Gift, Merge, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { formatPrice } from '@/utils/formatPrice'

/*
 * Карточка покупателя (30 октября 2026): контакты, все заказы с составом —
 * с сайта и из кассы — и история бонусов.
 *
 * Та же страница показывает карточку магазина (`kind: 'offline'`) —
 * покупателя кассы без аккаунта. У аккаунта с тем же телефоном — блок
 * «Объединить»: телефон в профиле никто не подтверждает, поэтому решает
 * администратор, а не автоматика (решение владельца 30.10.2026).
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
  fromCard: boolean
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
  by: string | null
}

interface AdminUserDetail {
  id: string
  kind: 'account' | 'offline'
  offlineMatch: {
    id: string
    name: string | null
    phone: string
    orders: number
    activeBonuses: number
    pendingBonuses: number
  } | null
  mergedInto: { id: string, name: string | null, at: string } | null
  name: string | null
  phone: string | null
  email: string | null
  role: string | null
  createdAt: string
  activeBonuses: number
  pendingBonuses: number
  summary: { orders: number, cancelled: number, spent: number, lastOrderAt: string | null }
  orders: AdminUserOrder[]
  /** Что лежит в корзине сейчас, не оформлено (31.10.2026) */
  cart: {
    updatedAt: string
    total: number
    quantity: number
    items: { productId: string, name: string, slug: string | null, quantity: number, price: number, stock: number }[]
  } | null
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
  manual: 'Начислено вручную',
}

/*
 * Ручное начисление (30 октября 2026): «если вдруг бонусы не были зачислены».
 * Доступны сразу — решение владельца. Причину видит и покупатель — она
 * уходит ему в уведомление.
 */
const bonusOpen = ref(false)
const bonusAmount = ref<number | null>(null)
const bonusReason = ref('')
const bonusOrderId = ref('')
const bonusSaving = ref(false)

function openBonus() {
  bonusAmount.value = null
  bonusReason.value = ''
  bonusOrderId.value = ''
  bonusOpen.value = true
}

const bonusValid = computed(() =>
  Number.isInteger(bonusAmount.value) && bonusAmount.value! >= 1 && bonusAmount.value! <= 100000
  && bonusReason.value.trim().length >= 3)

async function submitBonus() {
  if (!bonusValid.value || bonusSaving.value)
    return
  bonusSaving.value = true
  try {
    await adminFetch(`/api/admin/users/${id.value}/bonus`, {
      method: 'POST',
      body: { amount: bonusAmount.value, reason: bonusReason.value.trim(), orderId: bonusOrderId.value || null },
    })
    toast.success(`Начислено ${bonusAmount.value} бонусов`)
    bonusOpen.value = false
    await refresh()
  }
  catch (e: any) {
    toast.error(e?.data?.message || e?.statusMessage || 'Не удалось начислить бонусы')
  }
  finally {
    bonusSaving.value = false
  }
}

const mergeOpen = ref(false)
const merging = ref(false)

async function submitMerge() {
  const card = user.value?.offlineMatch
  if (!card || merging.value)
    return
  merging.value = true
  try {
    const res = await adminFetch<{ orders: number, active_moved: number, pending_moved: number }>(
      `/api/admin/users/${id.value}/merge`,
      { method: 'POST', body: { offlineCustomerId: card.id } },
    )
    toast.success(`Объединено: покупок ${res.orders}, бонусов ${res.active_moved + res.pending_moved}`)
    mergeOpen.value = false
    await refresh()
  }
  catch (e: any) {
    toast.error(e?.data?.message || e?.statusMessage || 'Не удалось объединить')
  }
  finally {
    merging.value = false
  }
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
              <Badge v-if="user.kind === 'offline'" variant="outline">
                Карточка магазина
              </Badge>
            </CardTitle>
            <CardDescription class="flex flex-wrap gap-x-4 gap-y-1">
              <a v-if="user.phone" :href="phoneHref(user.phone)" class="text-primary hover:underline">{{ user.phone }}</a>
              <span v-else>телефона нет</span>
              <a v-if="user.email" :href="`mailto:${user.email}`" class="text-primary hover:underline">{{ user.email }}</a>
              <span>{{ user.kind === 'offline' ? 'карточка заведена' : 'на сайте с' }} {{ dateTime(user.createdAt) }}</span>
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

        <Card v-if="user.mergedInto" class="border-muted">
          <CardContent class="pt-6 text-sm">
            Карточка объединена с аккаунтом
            <NuxtLink :to="`/admin/users/${user.mergedInto.id}`" class="text-primary hover:underline">
              {{ user.mergedInto.name || 'без имени' }}
            </NuxtLink>
            {{ dateTime(user.mergedInto.at) }} — покупки и бонусы теперь там.
          </CardContent>
        </Card>

        <Card v-if="user.offlineMatch" class="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div class="space-y-1">
              <CardTitle class="text-base">
                Есть карточка магазина с тем же телефоном
              </CardTitle>
              <CardDescription>
                <NuxtLink :to="`/admin/users/${user.offlineMatch.id}`" class="text-primary hover:underline">
                  {{ user.offlineMatch.name || 'Без имени' }}
                </NuxtLink>
                · {{ user.offlineMatch.phone }} · покупок {{ user.offlineMatch.orders }} ·
                бонусов {{ user.offlineMatch.activeBonuses }}<template v-if="user.offlineMatch.pendingBonuses">
                  + {{ user.offlineMatch.pendingBonuses }} ждут
                </template>
              </CardDescription>
            </div>
            <Button size="sm" @click="mergeOpen = true">
              <Merge class="w-4 h-4 mr-2" />
              Объединить
            </Button>
          </CardHeader>
        </Card>

        <Card v-if="user.cart">
          <CardHeader>
            <CardTitle>В корзине сейчас</CardTitle>
            <CardDescription>
              Положено, но не оформлено · обновлена {{ new Date(user.cart.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-2">
            <div
              v-for="item in user.cart.items"
              :key="item.productId"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <span class="min-w-0">
                <NuxtLink v-if="item.slug" :to="`/catalog/products/${item.slug}`" target="_blank" class="hover:underline">{{ item.name }}</NuxtLink>
                <span v-else>{{ item.name }}</span>
                <span v-if="item.stock < item.quantity" class="ml-2 text-xs text-destructive">на складе {{ item.stock }}</span>
              </span>
              <span class="shrink-0 tabular-nums whitespace-nowrap">{{ item.quantity }} × {{ formatPrice(item.price) }}&nbsp;₸</span>
            </div>
            <div class="flex justify-between border-t pt-2 font-semibold">
              <span>Итого</span>
              <span class="tabular-nums whitespace-nowrap">{{ formatPrice(user.cart.total) }}&nbsp;₸</span>
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
                  <Badge v-if="order.fromCard" variant="outline" title="Покупка на карточку магазина до объединения">
                    с карточки
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
          <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>История бонусов</CardTitle>
            <Button v-if="!user.mergedInto" size="sm" @click="openBonus">
              <Gift class="w-4 h-4 mr-2" />
              Начислить бонусы
            </Button>
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
                    <div v-if="b.by" class="text-xs text-muted-foreground">
                      начислил: {{ b.by }}
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

    <Dialog v-model:open="mergeOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Объединить с карточкой магазина?</DialogTitle>
          <DialogDescription>
            Покупки и бонусы карточки «{{ user?.offlineMatch?.name }}» перейдут в аккаунт
            «{{ user?.name || 'без имени' }}». Отменить нельзя. Телефон в профиле покупатель
            вписал сам — убедитесь, что это тот же человек.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="mergeOpen = false">
            Отмена
          </Button>
          <Button :disabled="merging" @click="submitMerge">
            {{ merging ? 'Объединяю…' : 'Объединить' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="bonusOpen">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Начислить бонусы</DialogTitle>
          <DialogDescription>
            {{ user?.name || 'Покупателю' }} — бонусы будут доступны сразу. Причину покупатель увидит в уведомлении.
          </DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitBonus">
          <div class="space-y-1.5">
            <Label for="bonus-amount">Сколько бонусов</Label>
            <Input id="bonus-amount" v-model.number="bonusAmount" type="number" min="1" max="100000" step="1" inputmode="numeric" />
          </div>
          <div class="space-y-1.5">
            <Label for="bonus-reason">Причина</Label>
            <Textarea id="bonus-reason" v-model="bonusReason" rows="2" placeholder="Например: не начислились бонусы за заказ № 1005" />
          </div>
          <div v-if="user?.orders.length" class="space-y-1.5">
            <Label for="bonus-order">За какой заказ (необязательно)</Label>
            <select id="bonus-order" v-model="bonusOrderId" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">
                — без заказа —
              </option>
              <option v-for="o in user.orders" :key="o.id" :value="o.id">
                {{ o.number ? `№ ${o.number}` : o.id.slice(0, 8) }} · {{ dateTime(o.createdAt) }} · {{ formatPrice(o.total) }} ₸
              </option>
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="bonusOpen = false">
              Отмена
            </Button>
            <Button type="submit" :disabled="!bonusValid || bonusSaving">
              {{ bonusSaving ? 'Начисляю…' : 'Начислить' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
