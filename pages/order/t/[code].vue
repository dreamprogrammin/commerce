<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { SHOP } from '@/constants/shop'
import { formatPrice } from '@/utils/formatPrice'
import { isPickupOrder } from '@/utils/orderStatus'

/*
 * Статус заказа по ссылке (29 сентября 2026) — без входа и регистрации.
 * Гость, уйдя со страницы «Заказ оформлен», свой заказ больше не видел: RLS
 * отдаёт гостевые заказы только администраторам. Ссылка с кодом
 * отслеживания и есть доступ; данные даёт server/api/order-status/[code].
 */

interface OrderStatusResponse {
  orderNumber: number | null
  status: string
  createdAt: string
  total: number
  deliveryCost: number
  deliveryMethod: string | null
  paymentMethod: string | null
  deliveryAddress: { city?: string, line1?: string } | null
  deliveryDate: string | null
  deliverySlot: string | null
  pickupPoint: { name: string, address: string, working_hours: string | null, phone: string | null } | null
  items: { name: string, slug: string | null, image: string | null, quantity: number, price: number }[]
}

const route = useRoute()
const code = computed(() => String(route.params.code ?? ''))

const { data: order, error, refresh, pending } = await useFetch<OrderStatusResponse>(
  () => `/api/order-status/${code.value}`,
  { key: `order-status-${code.value}` },
)

useHead({ title: () => order.value?.orderNumber ? `Заказ №${order.value.orderNumber} — Ухтышка` : 'Статус заказа — Ухтышка' })

const { getVariantUrl } = useSupabaseStorage()
const imageUrl = (path: string | null) => path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'sm') : null

const isPickup = computed(() => isPickupOrder(order.value?.deliveryMethod))
const createdLabel = computed(() => {
  if (!order.value?.createdAt)
    return ''
  const d = new Date(order.value.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
})
// Дата доставки приходит как 2026-08-26 — показываем по-нашему
const deliveryDateLabel = computed(() => {
  const m = order.value?.deliveryDate?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : order.value?.deliveryDate ?? ''
})
const paymentLabel = computed(() => ({ kaspi: 'Kaspi', cash: 'Наличными при получении', card: 'Картой' } as Record<string, string>)[order.value?.paymentMethod ?? ''] ?? '')
const phoneHref = `tel:${SHOP.phone.replace(/[^\d+]/g, '')}`
</script>

<template>
  <div class="mx-auto max-w-[640px] px-4 py-6 md:py-10">
    <div v-if="error" class="rounded-2xl border bg-card p-6 text-center space-y-3">
      <h1 class="text-xl font-bold">
        Заказ не найден
      </h1>
      <p class="text-sm text-muted-foreground">
        Проверьте ссылку — её можно скопировать со страницы «Заказ оформлен» или из письма.
        Если не получается, позвоните нам:
        <a :href="phoneHref" class="text-primary hover:underline whitespace-nowrap">{{ SHOP.phoneHuman }}</a>
      </p>
    </div>

    <div v-else-if="order" class="space-y-5">
      <section class="rounded-2xl border bg-card p-5 flex flex-col items-center gap-2 text-center">
        <span class="text-sm text-muted-foreground">Заказ</span>
        <h1 class="text-2xl font-extrabold">
          №{{ order.orderNumber }}
        </h1>
        <span v-if="createdLabel" class="text-[13px] text-muted-foreground">{{ createdLabel }}</span>
        <OrderTrackerLottie :status="order.status" :delivery-method="order.deliveryMethod" />
        <OrderProgressBar :status="order.status" :delivery-method="order.deliveryMethod" class="mt-2 w-full max-w-[472px]" />
        <Button variant="outline" size="sm" class="mt-3" :disabled="pending" @click="refresh()">
          <Icon name="lucide:refresh-cw" class="size-4 mr-2" :class="{ 'animate-spin': pending }" />
          Обновить статус
        </Button>
      </section>

      <section class="rounded-2xl border bg-card p-5 space-y-1.5 text-sm">
        <h2 class="text-base font-bold mb-1">
          {{ isPickup ? 'Самовывоз' : 'Доставка курьером' }}
        </h2>
        <template v-if="isPickup">
          <p>{{ order.pickupPoint?.name ?? 'Пункт выдачи' }}: {{ order.pickupPoint?.address ?? SHOP.street }}</p>
          <p class="text-muted-foreground">
            {{ order.pickupPoint?.working_hours || SHOP.openingHoursHuman }}
          </p>
        </template>
        <template v-else>
          <p v-if="order.deliveryAddress">
            {{ [order.deliveryAddress.city, order.deliveryAddress.line1].filter(Boolean).join(', ') }}
          </p>
          <p v-if="deliveryDateLabel" class="text-muted-foreground">
            {{ deliveryDateLabel }}{{ order.deliverySlot ? `, ${order.deliverySlot}` : '' }}
          </p>
        </template>
        <p v-if="paymentLabel" class="text-muted-foreground">
          Оплата: {{ paymentLabel }}
        </p>
      </section>

      <section class="rounded-2xl border bg-card p-5">
        <h2 class="text-base font-bold mb-3">
          Состав заказа
        </h2>
        <ul class="space-y-3">
          <li v-for="(item, i) in order.items" :key="i" class="flex items-center gap-3">
            <img v-if="imageUrl(item.image)" :src="imageUrl(item.image)!" :alt="item.name" class="size-14 shrink-0 rounded-lg object-cover bg-muted" loading="lazy">
            <div v-else class="size-14 shrink-0 rounded-lg bg-muted" />
            <div class="min-w-0 flex-1 text-sm">
              <NuxtLink v-if="item.slug" :to="`/catalog/products/${item.slug}`" class="line-clamp-2 hover:underline">
                {{ item.name }}
              </NuxtLink>
              <span v-else class="line-clamp-2">{{ item.name }}</span>
              <span class="text-muted-foreground">{{ item.quantity }} шт. × {{ formatPrice(item.price) }}&nbsp;₸</span>
            </div>
          </li>
        </ul>
        <div class="mt-4 border-t pt-3 space-y-1 text-sm">
          <div v-if="order.deliveryCost" class="flex justify-between text-muted-foreground">
            <span>Доставка</span><span>{{ formatPrice(order.deliveryCost) }}&nbsp;₸</span>
          </div>
          <div class="flex justify-between text-base font-bold">
            <span>Итого</span><span>{{ formatPrice(order.total) }}&nbsp;₸</span>
          </div>
        </div>
      </section>

      <p class="text-center text-sm text-muted-foreground">
        Вопросы по заказу —
        <a :href="phoneHref" class="text-primary hover:underline whitespace-nowrap">{{ SHOP.phoneHuman }}</a>,
        {{ SHOP.openingHoursHuman }}
      </p>
    </div>
  </div>
</template>
