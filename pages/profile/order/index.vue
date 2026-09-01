<script setup lang="ts">
import type { UserOrder } from '@/composables/orders/useUserOrders'

import type { OrderBadgeTone } from '@/utils/orderStatus'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { profilePageShell } from '@/lib/shell'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { pluralizeRu } from '@/utils/formatChildAge'
import { formatPrice } from '@/utils/formatPrice'
import { orderStatusBadge } from '@/utils/orderStatus'

definePageMeta({
  layout: 'shell',
  shell: profilePageShell,
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({ title: 'Мои заказы' })

const { getVariantUrl } = useSupabaseStorage()
const cartStore = useCartStore()

const { orders, isLoading, error, fetchOrders, subscribeToOrderUpdates } = useUserOrders()

let channel: ReturnType<typeof subscribeToOrderUpdates> = null

onMounted(async () => {
  await fetchOrders()
  channel = subscribeToOrderUpdates()
})

onUnmounted(() => channel?.unsubscribe())

// --- ФИЛЬТР ---
const TABS = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'done', label: 'Выполнены' },
  { key: 'cancelled', label: 'Отменённые' },
] as const

type TabKey = typeof TABS[number]['key']

const activeTab = ref<TabKey>('all')

/** Вкладки режут список по тону плашки — отдельного маппинга статусов не нужно. */
const TONES_BY_TAB: Record<Exclude<TabKey, 'all'>, OrderBadgeTone[]> = {
  active: ['processing', 'shipping'],
  done: ['done'],
  cancelled: ['cancelled'],
}

// --- ПРЕДСТАВЛЕНИЕ ---
const BADGE_CLASSES: Record<OrderBadgeTone, string> = {
  cancelled: 'bg-red-50 text-red-600',
  done: 'bg-green-50 text-green-600',
  shipping: 'bg-orange-50 text-orange-600',
  processing: 'bg-blue-50 text-primary',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** В макете дата без «г.» на конце, а ru-RU его дописывает. */
function formatOrderDate(value: string) {
  return dateFormatter.format(new Date(value)).replace(/\s*г\.$/, '')
}

// В карточке помещается три превью, остальные сворачиваются в плитку «+N»
const MAX_THUMBS = 3

function buildRow(order: UserOrder) {
  const badge = orderStatusBadge(order.status)
  const items = order.order_items ?? []
  const thumbs = items.slice(0, MAX_THUMBS)
  const bonus = order.bonuses_awarded ?? 0

  return {
    id: order.id,
    number: order.id.slice(-6),
    date: formatOrderDate(order.created_at),
    itemsLabel: `${items.length} ${pluralizeRu(items.length, ['товар', 'товара', 'товаров'])}`,
    badge,
    badgeClass: BADGE_CLASSES[badge.tone],
    thumbs,
    moreCount: items.length - thumbs.length,
    total: `${formatPrice(order.final_amount ?? 0)} ₸`,
    // У отменённого заказа бонусы вернулись покупателю — в макете плашки нет
    hasBonus: bonus > 0 && badge.tone !== 'cancelled',
    bonusLabel: `+${formatPrice(bonus)} ${pluralizeRu(bonus, ['бонус', 'бонуса', 'бонусов'])}`,
    canRepeat: badge.tone === 'done',
    order,
  }
}

const rows = computed(() => {
  const list = activeTab.value === 'all'
    ? orders.value
    : orders.value.filter(order => TONES_BY_TAB[activeTab.value as Exclude<TabKey, 'all'>]
        .includes(orderStatusBadge(order.status).tone))

  return list.map(buildRow)
})

const countLabel = computed(() => {
  const total = orders.value.length
  return `${total} ${pluralizeRu(total, ['заказ', 'заказа', 'заказов'])} за всё время`
})

const hasNoOrdersAtAll = computed(() => !isLoading.value && !error.value && orders.value.length === 0)

/*
 * Вариант `sm`, а не голый public URL: в `product_images.image_url` лежит путь
 * без расширения, самого файла по нему в бакете нет — залиты только варианты
 * `_sm/_md/_lg.webp`. Прежний `getPublicUrl` отдавал 400, и превью в списке
 * заказов не грузились вообще (проверено на проде 2026-08-12).
 */
function thumbUrl(item: UserOrder['order_items'][number]) {
  const image = item.product?.product_images?.[0]
  return image ? getVariantUrl(BUCKET_NAME_PRODUCT, image.image_url, 'sm') : null
}

// --- ПОВТОР ЗАКАЗА ---
const repeatingOrderId = ref<string | null>(null)

/*
 * `addItem` сам догружает товар по id и отбивается от параллельных вызовов
 * ранним выходом, поэтому позиции добавляются строго по очереди — иначе
 * половина заказа молча потерялась бы.
 */
async function repeatOrder(order: UserOrder) {
  repeatingOrderId.value = order.id
  try {
    for (const item of order.order_items ?? []) {
      if (item.product?.id)
        await cartStore.addItem(item.product.id, item.quantity)
    }
  }
  finally {
    repeatingOrderId.value = null
  }
}
</script>

<template>
  <ProfileShell>
    <div class="flex flex-col gap-[18px]">
      <!-- 🧾 Шапка со вкладками -->
      <div class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm">
        <h1 class="mb-1 text-[clamp(24px,2.8vw,30px)] font-extrabold tracking-[-0.025em]">
          Мои заказы
        </h1>
        <p class="mb-[18px] text-sm font-medium text-muted-foreground">
          {{ countLabel }}
        </p>
        <div class="ord-scroll flex gap-2 overflow-x-auto pb-0.5">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            type="button"
            class="h-[38px] flex-none whitespace-nowrap rounded-full px-[17px] text-[13.5px] font-bold transition-all"
            :class="
              activeTab === tab.key
                ? 'border border-transparent bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_6px_16px_rgba(43,127,255,0.3)]'
                : 'border border-border bg-white text-foreground'
            "
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>

      <!-- ⏳ Загрузка -->
      <template v-if="isLoading">
        <div
          v-for="n in 3"
          :key="`skeleton-${n}`"
          class="h-[212px] animate-pulse rounded-[clamp(18px,2vw,22px)] border border-border bg-white/70"
        />
      </template>

      <!-- ⚠️ Ошибка -->
      <div
        v-else-if="error"
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white px-6 py-12 text-center shadow-sm"
      >
        <Icon name="lucide:alert-circle" class="size-12 text-destructive" />
        <p class="mb-1.5 mt-3.5 text-[17px] font-bold text-foreground">
          Не удалось загрузить заказы
        </p>
        <p class="mb-5 text-sm font-medium text-muted-foreground">
          {{ error }}
        </p>
        <button
          type="button"
          class="inline-flex h-10 items-center gap-1.5 rounded-full bg-blue-50 px-[17px] text-[13.5px] font-bold text-primary transition-colors hover:bg-blue-100"
          @click="fetchOrders()"
        >
          Попробовать снова
        </button>
      </div>

      <!-- 🛍️ Заказов нет вообще -->
      <div
        v-else-if="hasNoOrdersAtAll"
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white px-6 py-12 text-center shadow-sm"
      >
        <span class="mb-4 inline-grid size-[72px] place-content-center rounded-full bg-blue-50 text-primary">
          <Icon name="lucide:shopping-bag" class="size-[34px]" />
        </span>
        <p class="mb-1.5 text-[19px] font-extrabold text-foreground">
          У вас пока нет заказов
        </p>
        <p class="mb-5 text-sm font-medium text-muted-foreground">
          Начните покупки в нашем каталоге
        </p>
        <NuxtLink
          to="/catalog/all"
          class="inline-flex h-[46px] items-center gap-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 px-[22px] text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(43,127,255,0.3)]"
        >
          <Icon name="lucide:shopping-bag" class="size-[18px]" />
          В каталог
        </NuxtLink>
      </div>

      <!-- 📦 Заказы -->
      <template v-else>
        <div
          v-for="row in rows"
          :key="row.id"
          class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="flex min-w-0 flex-col leading-[1.3]">
              <span class="text-[clamp(16px,1.9vw,19px)] font-extrabold text-foreground">
                Заказ №{{ row.number }}
              </span>
              <span class="mt-0.5 text-[13.5px] font-medium text-muted-foreground">
                {{ row.date }} · {{ row.itemsLabel }}
              </span>
            </span>
            <span
              class="inline-flex flex-none items-center gap-[5px] whitespace-nowrap rounded-full px-[11px] py-[5px] text-[12.5px] font-bold"
              :class="row.badgeClass"
            >
              <Icon :name="row.badge.icon" class="size-3.5" />
              {{ row.badge.label }}
            </span>
          </div>

          <div class="my-4 flex gap-[9px]">
            <span
              v-for="item in row.thumbs"
              :key="item.id"
              class="size-[58px] flex-none overflow-hidden rounded-[14px] border border-border bg-white p-[7px]"
            >
              <ProgressiveImage
                v-if="thumbUrl(item)"
                :src="thumbUrl(item)"
                :alt="item.product.name"
                :blur-data-url="item.product.product_images?.[0]?.blur_placeholder"
                aspect-ratio="square"
                object-fit="contain"
                placeholder-type="lqip"
                eager
              />
              <span v-else class="grid size-full place-content-center text-muted-foreground">
                <Icon name="lucide:package" class="size-5" />
              </span>
            </span>
            <span
              v-if="row.moreCount > 0"
              class="grid size-[58px] flex-none place-content-center rounded-[14px] border border-border bg-muted text-[15px] font-extrabold text-muted-foreground"
            >
              +{{ row.moreCount }}
            </span>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3.5 border-t border-border pt-[15px]">
            <div class="flex flex-wrap items-baseline gap-2.5">
              <span class="text-[13px] font-medium text-muted-foreground">Сумма заказа</span>
              <span class="whitespace-nowrap text-[clamp(18px,2vw,21px)] font-extrabold text-foreground">
                {{ row.total }}
              </span>
              <span
                v-if="row.hasBonus"
                class="inline-flex items-center gap-[5px] whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-600"
              >
                <Icon name="lucide:gift" class="size-3" />
                {{ row.bonusLabel }}
              </span>
            </div>

            <div class="flex items-center gap-[9px]">
              <button
                v-if="row.canRepeat"
                type="button"
                :disabled="repeatingOrderId === row.id"
                class="inline-flex h-10 items-center gap-[7px] rounded-full border border-border bg-white px-4 text-[13.5px] font-bold transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
                @click="repeatOrder(row.order)"
              >
                <Icon name="lucide:rotate-ccw" class="size-[15px]" />
                Повторить
              </button>
              <NuxtLink
                :to="`/profile/order/${row.id}`"
                class="inline-flex h-10 items-center gap-1.5 rounded-full bg-blue-50 px-[17px] text-[13.5px] font-bold text-primary transition-colors hover:bg-blue-100"
              >
                Подробнее
                <Icon name="lucide:chevron-right" class="size-[15px]" />
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- 🔍 Пусто по выбранной вкладке -->
        <div
          v-if="!rows.length"
          class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white px-6 py-12 text-center shadow-sm"
        >
          <Icon name="lucide:package-search" class="size-12 text-gray-300" />
          <p class="mt-3.5 text-[17px] font-bold text-foreground">
            Заказов в этой категории нет
          </p>
        </div>
      </template>
    </div>
  </ProfileShell>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .ord-scroll {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .ord-scroll::-webkit-scrollbar {
    display: none;
  }
}
</style>
