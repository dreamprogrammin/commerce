<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'
import { formatPrice } from '@/utils/formatPrice'

/*
 * Корзины (29 сентября 2026) — два разных источника, и это не случайно:
 *  • «Брошенные корзины» — наша база (`server_carts`): только вошедшие
 *    покупатели, зато с именем, телефоном и email — им можно написать;
 *  • «Что добавляют в корзину» — Google Analytics: все посетители, но
 *    обезличенно. Имён GA не даёт и давать не должна.
 */
definePageMeta({ layout: 'admin' })

interface AbandonedCart {
  name: string | null
  phone: string | null
  email: string | null
  updatedAt: string | null
  total: number
  items: { name: string, slug: string | null, quantity: number, price: number, inStock: boolean }[]
}

interface CartAnalytics {
  configured: boolean
  days?: number
  funnel?: { event: string, count: number, users: number }[]
  items?: { name: string, viewed: number, addedToCart: number, checkedOut: number, purchased: number }[]
  channels?: { channel: string, count: number, users: number }[]
}

const FUNNEL_LABELS: Record<string, string> = {
  view_item: 'Смотрели товар',
  add_to_cart: 'Добавили в корзину',
  view_cart: 'Открыли корзину',
  begin_checkout: 'Начали оформление',
  add_shipping_info: 'Заполнили доставку',
  add_payment_info: 'Нажали «Оформить»',
  purchase: 'Оформили заказ',
}

const days = ref(30)

const { data: carts, pending: cartsPending, refresh: refreshCarts, error: cartsError }
  = useFetch<AbandonedCart[]>('/api/admin/abandoned-carts', { server: false })
const { data: analytics, pending: analyticsPending, refresh: refreshAnalytics, error: analyticsError }
  = useFetch<CartAnalytics>('/api/admin/cart-analytics', { query: { days }, server: false })

function refreshAll() {
  refreshCarts()
  refreshAnalytics()
}

function ago(iso: string | null) {
  if (!iso)
    return '—'
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1)
    return 'меньше часа назад'
  if (hours < 24)
    return `${hours} ч назад`
  return `${Math.floor(hours / 24)} дн назад`
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

const maxFunnel = computed(() => Math.max(1, ...(analytics.value?.funnel ?? []).map(f => f.users)))
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Корзины
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Кто не оформил заказ и что кладут в корзину
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="cartsPending || analyticsPending" @click="refreshAll">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': cartsPending || analyticsPending }" />
        Обновить
      </Button>
    </div>

    <!-- Брошенные корзины: наша база, только вошедшие -->
    <Card>
      <CardHeader>
        <CardTitle>Брошенные корзины</CardTitle>
        <CardDescription>
          Вошедшие покупатели, у которых в корзине остались товары. У гостей корзина хранится
          только в их браузере — их здесь нет.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Данные только из браузера (server: false) — вне ClientOnly
             состояние загрузки расходилось при гидратации -->
        <ClientOnly>
          <template #fallback>
            <Skeleton class="h-20 w-full" />
          </template>
          <p v-if="cartsError" class="text-sm text-destructive">
            Не удалось загрузить: {{ cartsError.statusMessage || cartsError.message }}
          </p>
          <template v-else-if="cartsPending">
            <Skeleton v-for="i in 2" :key="i" class="h-20 w-full" />
          </template>
          <p v-else-if="!carts?.length" class="text-sm text-muted-foreground">
            Брошенных корзин нет.
          </p>
          <div v-for="(cart, i) in carts" v-else :key="i" class="rounded-lg border p-4 space-y-2">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div class="font-semibold">
                {{ cart.name || 'Без имени' }}
              </div>
              <div class="text-sm text-muted-foreground">
                {{ ago(cart.updatedAt) }} · {{ formatPrice(cart.total) }}&nbsp;₸
              </div>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <a v-if="cart.phone" :href="phoneHref(cart.phone)" class="text-primary hover:underline">{{ cart.phone }}</a>
              <a v-if="cart.email" :href="`mailto:${cart.email}`" class="text-primary hover:underline">{{ cart.email }}</a>
              <span v-if="!cart.phone && !cart.email" class="text-muted-foreground">контактов нет</span>
            </div>
            <ul class="text-sm space-y-0.5">
              <li v-for="(item, j) in cart.items" :key="j">
                <NuxtLink v-if="item.slug" :to="`/catalog/products/${item.slug}`" target="_blank" class="hover:underline">
                  {{ item.name }}
                </NuxtLink>
                <span v-else>{{ item.name }}</span>
                — {{ item.quantity }} шт. × {{ formatPrice(item.price) }}&nbsp;₸
                <span v-if="!item.inStock" class="text-destructive">(нет в наличии)</span>
              </li>
            </ul>
          </div>
        </ClientOnly>
      </CardContent>
    </Card>

    <!-- Сводка Google Analytics: все посетители, обезличенно -->
    <Card>
      <CardHeader>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Что добавляют в корзину</CardTitle>
            <CardDescription>
              Google Analytics, все посетители без имён. Шаги оформления собираются с 29 сентября 2026.
            </CardDescription>
          </div>
          <div class="flex gap-1">
            <Button
              v-for="d in [7, 30, 90]"
              :key="d"
              size="sm"
              :variant="days === d ? 'default' : 'outline'"
              @click="days = d"
            >
              {{ d }} дн
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <ClientOnly>
          <template #fallback>
            <Skeleton class="h-40 w-full" />
          </template>
          <p v-if="analyticsError" class="text-sm text-destructive">
            Не удалось загрузить: {{ analyticsError.statusMessage || analyticsError.message }}
          </p>
          <template v-else-if="analyticsPending">
            <Skeleton class="h-40 w-full" />
          </template>
          <p v-else-if="analytics && !analytics.configured" class="text-sm text-muted-foreground">
            Google Analytics не подключена: на сервере не задан ключ сервисного аккаунта
            (<code>GA_SERVICE_ACCOUNT_JSON</code>).
          </p>
          <template v-else-if="analytics">
            <div>
              <h3 class="font-semibold mb-2">
                Воронка — сколько человек дошли до шага
              </h3>
              <div class="space-y-1.5">
                <div v-for="step in analytics.funnel" :key="step.event" class="grid grid-cols-[11rem_1fr_3rem] items-center gap-2 text-sm">
                  <span>{{ FUNNEL_LABELS[step.event] ?? step.event }}</span>
                  <div class="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div class="h-full bg-primary" :style="{ width: `${(step.users / maxFunnel) * 100}%` }" />
                  </div>
                  <span class="text-right tabular-nums">{{ step.users }}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 class="font-semibold mb-2">
                Товары, которые добавляли в корзину
              </h3>
              <p v-if="!analytics.items?.length" class="text-sm text-muted-foreground">
                За этот период — ни одного.
              </p>
              <div v-else class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead class="text-muted-foreground">
                    <tr class="text-left">
                      <th class="py-1 pr-3 font-medium">
                        Товар
                      </th>
                      <th class="py-1 px-2 font-medium text-right">
                        Смотрели
                      </th>
                      <th class="py-1 px-2 font-medium text-right">
                        В корзину
                      </th>
                      <th class="py-1 px-2 font-medium text-right">
                        Оформляли
                      </th>
                      <th class="py-1 pl-2 font-medium text-right">
                        Купили
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="item in analytics.items" :key="item.name" class="border-t">
                      <td class="py-1.5 pr-3">
                        {{ item.name }}
                      </td>
                      <td class="py-1.5 px-2 text-right tabular-nums">
                        {{ item.viewed }}
                      </td>
                      <td class="py-1.5 px-2 text-right tabular-nums font-semibold">
                        {{ item.addedToCart }}
                      </td>
                      <td class="py-1.5 px-2 text-right tabular-nums">
                        {{ item.checkedOut }}
                      </td>
                      <td class="py-1.5 pl-2 text-right tabular-nums">
                        {{ item.purchased }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 class="font-semibold mb-2">
                Откуда пришли те, кто добавлял в корзину
              </h3>
              <p v-if="!analytics.channels?.length" class="text-sm text-muted-foreground">
                Нет данных.
              </p>
              <ul v-else class="text-sm space-y-0.5">
                <li v-for="c in analytics.channels" :key="c.channel">
                  {{ c.channel }} — {{ c.users }} чел., {{ c.count }} добавлений
                </li>
              </ul>
            </div>
          </template>
        </ClientOnly>
      </CardContent>
    </Card>
  </div>
</template>
