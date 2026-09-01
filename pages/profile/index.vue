<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

import { storeToRefs } from 'pinia'
import TelegramBanner from '@/components/profile/TelegramBanner.vue'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { profilePageShell } from '@/lib/shell'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import { formatPrice } from '@/utils/formatPrice'

// --- Stores ---
const authStore = useAuthStore()
const profileStore = useProfileStore()
const wishlistStore = useWishlistStore()

// --- Данные профиля ---
const { profile, fullName, bonusBalance, isLoading: isLoadingProfile, pendingBonuses } = storeToRefs(profileStore)
const { user } = storeToRefs(authStore)

// --- Заказы ---
const { orders, fetchOrders, getStatusLabel } = useUserOrders()

// --- Избранное ---
const { wishlistProducts, wishlistProductIds } = storeToRefs(wishlistStore)
const { fetchWishlistProducts } = wishlistStore

// --- Бонусные транзакции ---
const supabase = useSupabaseClient()
const bonusTransactions = ref<any[]>([])

const userInitial = computed(() => {
  if (fullName.value)
    return fullName.value.charAt(0).toUpperCase()
  if (user.value?.email)
    return user.value.email.charAt(0).toUpperCase()
  return 'U'
})

// --- Методы ---
async function loadBonusTransactions() {
  try {
    const { data, error } = await supabase.rpc('get_bonus_history', {
      p_limit: 3,
      p_offset: 0,
    })
    if (!error) {
      bonusTransactions.value = data || []
    }
  }
  catch (e) {
    console.error('[Profile] Error loading bonus history:', e)
  }
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(dateString))
}

/** Склонение: 1 товар / 2 товара / 5 товаров */
function pluralItems(count: number) {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11)
    return `${count} товар`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return `${count} товара`
  return `${count} товаров`
}

function orderItemsLabel(order: { order_items: Array<{ quantity: number }> }) {
  return pluralItems(order.order_items.reduce((sum, i) => sum + i.quantity, 0))
}

function statusBadgeClass(status: string) {
  if (status === 'cancelled')
    return 'bg-red-50 text-red-600'
  if (status === 'delivered' || status === 'completed')
    return 'bg-green-50 text-green-600'
  return 'bg-blue-50 text-primary'
}

/** Подпись, иконка и оттенок бонусной операции */
const BONUS_META: Record<string, { label: string, icon: string, tint: string }> = {
  earned: { label: 'Начислено за покупку', icon: 'lucide:shopping-bag', tint: 'bg-green-50 text-green-600' },
  welcome: { label: 'Приветственные бонусы', icon: 'lucide:gift', tint: 'bg-green-50 text-green-600' },
  review: { label: 'Бонусы за отзыв', icon: 'lucide:message-square', tint: 'bg-green-50 text-green-600' },
  activation: { label: 'Активация бонусов', icon: 'lucide:circle-check', tint: 'bg-green-50 text-green-600' },
  refund_spent: { label: 'Возврат бонусов', icon: 'lucide:undo-2', tint: 'bg-green-50 text-green-600' },
  birthday: { label: 'Бонусы ко дню рождения', icon: 'lucide:cake', tint: 'bg-pink-50 text-pink-600' },
  spent: { label: 'Списание за заказ', icon: 'lucide:gift', tint: 'bg-orange-50 text-orange-600' },
  refund_earned: { label: 'Отмена начисления', icon: 'lucide:undo-2', tint: 'bg-red-50 text-red-600' },
  expiration: { label: 'Сгорело бонусов', icon: 'lucide:timer', tint: 'bg-red-50 text-red-600' },
}

function bonusMeta(type: string) {
  return BONUS_META[type] ?? { label: 'Операция', icon: 'lucide:star', tint: 'bg-muted text-muted-foreground' }
}

// --- TanStack Query для кэширования ---
// ✅ Кешируем в localStorage для мгновенной загрузки страницы профиля
const { data: ordersData, isLoading: isLoadingOrdersQuery } = useQuery({
  queryKey: ['user-orders-recent', 3],
  queryFn: async () => {
    await fetchOrders(3) // ✅ Загружаем только 3 последних заказа
    return orders.value
  },
  staleTime: 2 * 60 * 1000, // 2 минуты
  gcTime: 5 * 60 * 1000, // 5 минут
  enabled: computed(() => !!user.value),
  meta: { allowCache: true }, // ✅ Разрешаем кеширование в localStorage для быстрой загрузки
})

// Полное количество заказов — карточка в макете показывает счётчик «за всё время»
const { data: ordersTotal } = useQuery({
  queryKey: ['user-orders-count'],
  queryFn: async () => {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.value!.id)
    return count ?? 0
  },
  staleTime: 2 * 60 * 1000,
  gcTime: 5 * 60 * 1000,
  enabled: computed(() => !!user.value),
  meta: { allowCache: true },
})

const { data: wishlistData, isLoading: isLoadingWishlistQuery } = useQuery({
  queryKey: ['user-wishlist-recent', 4],
  queryFn: async () => {
    await fetchWishlistProducts(4) // ✅ Загружаем только 4 товара
    return wishlistProducts.value
  },
  staleTime: 2 * 60 * 1000,
  gcTime: 5 * 60 * 1000,
  enabled: computed(() => !!user.value),
  meta: { allowCache: true }, // ✅ Разрешаем кеширование в localStorage
})

const { data: bonusData, isLoading: isLoadingBonusQuery } = useQuery({
  queryKey: ['user-bonus-recent', 3],
  queryFn: async () => {
    await loadBonusTransactions() // Уже загружает только 3
    return bonusTransactions.value
  },
  staleTime: 2 * 60 * 1000,
  gcTime: 5 * 60 * 1000,
  enabled: computed(() => !!user.value),
  meta: { allowCache: true }, // ✅ Разрешаем кеширование в localStorage
})

// --- Computed ---
const recentOrders = computed(() => ordersData.value || [])
const recentWishlist = computed(() => wishlistData.value || [])
const wishlistTotal = computed(() => wishlistProductIds.value.length || recentWishlist.value.length)

const stats = computed(() => [
  {
    to: '/profile/bonuses',
    icon: 'lucide:gift',
    iconClass: 'bg-orange-50 text-orange-600',
    label: 'Бонусы',
    value: formatPrice(bonusBalance.value),
    sub: pendingBonuses.value > 0 ? `+${formatPrice(pendingBonuses.value)} ожидают` : 'все активны',
    subClass: pendingBonuses.value > 0 ? 'text-orange-600' : 'text-muted-foreground',
  },
  {
    to: '/profile/order',
    icon: 'lucide:package',
    iconClass: 'bg-blue-50 text-primary',
    label: 'Заказы',
    value: String(ordersTotal.value ?? 0),
    sub: 'за всё время',
    subClass: 'text-muted-foreground',
  },
  {
    to: '/profile/wishlist',
    icon: 'lucide:heart',
    iconClass: 'bg-pink-50 text-pink-600',
    label: 'Избранное',
    value: String(wishlistTotal.value),
    sub: 'товаров',
    subClass: 'text-muted-foreground',
  },
  {
    to: '/profile/settings',
    icon: 'lucide:settings',
    iconClass: 'bg-muted text-foreground',
    label: 'Профиль',
    value: 'Настройки',
    sub: 'изменить данные',
    subClass: 'text-muted-foreground',
  },
])

// --- Инициализация ---
onMounted(async () => {
  // ✅ Загружаем профиль с таймаутом для Safari/Firefox
  if (!profile.value && !isLoadingProfile.value) {
    try {
      await Promise.race([
        profileStore.loadProfile(false, true),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Profile load timeout')), 5000),
        ),
      ])
    }
    catch (error) {
      console.error('[Profile Page] Profile load timeout or error:', error)
    }
  }

  // TanStack Query автоматически загружает данные параллельно
})

// --- Meta ---
definePageMeta({
  layout: 'shell',
  shell: profilePageShell,
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({
  title: 'Мой профиль',
})
</script>

<template>
  <ProfileShell>
    <div class="flex flex-col gap-[18px]">
      <!-- 👤 Шапка профиля -->
      <div
        class="flex items-center gap-4 rounded-[clamp(18px,2vw,24px)] border border-border bg-white p-[clamp(18px,2.4vw,26px)] shadow-sm"
      >
        <span
          class="grid size-[clamp(54px,6vw,66px)] flex-none place-content-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-[clamp(22px,2.6vw,26px)] font-extrabold text-white"
        >
          <ClientOnly fallback="U">
            {{ userInitial }}
          </ClientOnly>
        </span>
        <div class="min-w-0">
          <h1
            class="truncate text-[clamp(22px,2.8vw,30px)] font-extrabold tracking-[-0.025em]"
          >
            <ClientOnly fallback="Загрузка...">
              {{ fullName || 'Пользователь' }}
            </ClientOnly>
          </h1>
          <p class="mt-[3px] text-[clamp(13px,1.5vw,15px)] font-medium text-muted-foreground">
            <ClientOnly>{{ user?.email }}</ClientOnly>
          </p>
        </div>
      </div>

      <!-- Telegram баннер -->
      <ClientOnly>
        <TelegramBanner />
      </ClientOnly>

      <!-- 📊 Быстрые карточки -->
      <div class="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <NuxtLink
          v-for="stat in stats"
          :key="stat.to"
          :to="stat.to"
          class="flex flex-col rounded-[18px] border border-border bg-white px-[17px] py-4 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-[3px] hover:shadow-md"
        >
          <span class="flex items-center gap-2.5">
            <span
              class="grid size-[34px] flex-none place-content-center rounded-[11px]"
              :class="stat.iconClass"
            >
              <Icon :name="stat.icon" class="size-[18px]" />
            </span>
            <span class="text-[13px] font-semibold text-muted-foreground">{{ stat.label }}</span>
          </span>
          <span
            class="mt-3 min-w-0 truncate text-[clamp(22px,2.4vw,27px)] leading-[1.1] font-extrabold tracking-[-0.02em]"
          >
            {{ stat.value }}
          </span>
          <span class="mt-[3px] text-[12.5px] font-medium" :class="stat.subClass">
            {{ stat.sub }}
          </span>
        </NuxtLink>
      </div>

      <!-- 📦 Последние заказы -->
      <section
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
      >
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <h2 class="text-[clamp(18px,2vw,22px)] font-extrabold tracking-[-0.02em]">
            Последние заказы
          </h2>
          <NuxtLink
            v-if="recentOrders.length"
            to="/profile/order"
            class="inline-flex items-center gap-1.5 text-[13.5px] font-bold whitespace-nowrap text-primary"
          >
            Все заказы
            <Icon name="lucide:arrow-right" class="size-[15px]" />
          </NuxtLink>
        </div>

        <!-- Загрузка -->
        <div v-if="isLoadingOrdersQuery" class="space-y-3 pt-3">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!recentOrders.length" class="py-8 text-center">
          <Icon name="lucide:shopping-bag" class="mx-auto mb-3 size-12 text-muted-foreground" />
          <p class="mb-4 text-muted-foreground">
            У вас пока нет заказов
          </p>
          <Button as-child>
            <NuxtLink to="/catalog/all">
              Перейти в каталог
            </NuxtLink>
          </Button>
        </div>

        <!-- Список -->
        <div v-else>
          <NuxtLink
            v-for="order in recentOrders"
            :key="order.id"
            :to="`/profile/order/${order.id}`"
            class="flex items-center gap-3.5 border-t border-border px-1.5 py-3.5 transition-colors hover:bg-muted/40"
          >
            <span
              class="grid size-[46px] flex-none place-content-center rounded-xl bg-muted text-muted-foreground"
            >
              <Icon name="lucide:package" class="size-[22px]" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col leading-tight">
              <span class="truncate text-[15px] font-bold">Заказ №{{ order.id.slice(-6) }}</span>
              <span class="truncate text-[13px] font-medium text-muted-foreground">
                {{ formatDate(order.created_at) }} · {{ orderItemsLabel(order) }}
              </span>
            </span>
            <span class="flex flex-col items-end gap-1.5">
              <span
                class="rounded-full px-[11px] py-1 text-xs font-bold whitespace-nowrap"
                :class="statusBadgeClass(order.status)"
              >
                {{ getStatusLabel(order.status) }}
              </span>
              <span class="text-[15px] font-extrabold whitespace-nowrap">
                {{ formatPrice(order.final_amount) }}&nbsp;₸
              </span>
            </span>
          </NuxtLink>
        </div>
      </section>

      <!-- ❤️ Избранное -->
      <section
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="text-[clamp(18px,2vw,22px)] font-extrabold tracking-[-0.02em]">
            Избранное
          </h2>
          <NuxtLink
            v-if="recentWishlist.length"
            to="/profile/wishlist"
            class="inline-flex items-center gap-1.5 text-[13.5px] font-bold whitespace-nowrap text-primary"
          >
            Все товары
            <Icon name="lucide:arrow-right" class="size-[15px]" />
          </NuxtLink>
        </div>

        <!-- Загрузка -->
        <div
          v-if="isLoadingWishlistQuery"
          class="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] lg:gap-4"
        >
          <Skeleton v-for="i in 4" :key="i" class="aspect-square rounded-xl" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!recentWishlist.length" class="py-8 text-center">
          <Icon name="lucide:heart" class="mx-auto mb-3 size-12 text-muted-foreground" />
          <p class="mb-4 text-muted-foreground">
            Список избранного пуст
          </p>
          <Button variant="outline" as-child>
            <NuxtLink to="/catalog/all">
              Найти товары
            </NuxtLink>
          </Button>
        </div>

        <!-- Сетка товаров -->
        <div
          v-else
          class="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] lg:gap-4"
        >
          <ProductCard
            v-for="product in recentWishlist"
            :key="product.id"
            :product="product"
          />
        </div>
      </section>

      <!-- 🎁 Последние бонусные операции -->
      <section
        class="rounded-[clamp(18px,2vw,22px)] border border-border bg-white p-[clamp(16px,2.2vw,24px)] shadow-sm"
      >
        <div class="mb-1.5 flex items-center justify-between gap-3">
          <h2 class="text-[clamp(18px,2vw,22px)] font-extrabold tracking-[-0.02em]">
            Бонусные операции
          </h2>
          <NuxtLink
            v-if="bonusData && bonusData.length"
            to="/profile/bonuses"
            class="inline-flex items-center gap-1.5 text-[13.5px] font-bold whitespace-nowrap text-primary"
          >
            История
            <Icon name="lucide:arrow-right" class="size-[15px]" />
          </NuxtLink>
        </div>

        <!-- Загрузка -->
        <div v-if="isLoadingBonusQuery" class="space-y-3 pt-3">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!bonusData || !bonusData.length" class="py-8 text-center">
          <Icon name="lucide:star" class="mx-auto mb-3 size-12 text-muted-foreground" />
          <p class="text-muted-foreground">
            Пока нет операций с бонусами
          </p>
        </div>

        <!-- Список -->
        <div v-else>
          <div
            v-for="tx in bonusData"
            :key="tx.id"
            class="flex items-center gap-3.5 border-t border-border px-1.5 py-3.5"
          >
            <span
              class="grid size-[34px] flex-none place-content-center rounded-[11px]"
              :class="bonusMeta(tx.transaction_type).tint"
            >
              <Icon :name="bonusMeta(tx.transaction_type).icon" class="size-5" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col leading-tight">
              <span class="truncate text-[15px] font-bold">{{ bonusMeta(tx.transaction_type).label }}</span>
              <span class="text-[13px] font-medium text-muted-foreground">{{ formatDate(tx.created_at) }}</span>
            </span>
            <span
              class="text-[15px] font-extrabold whitespace-nowrap"
              :class="tx.amount > 0 ? 'text-green-600' : 'text-red-600'"
            >
              {{ tx.amount > 0 ? '+' : '−' }}{{ formatPrice(Math.abs(tx.amount)) }}&nbsp;₸
            </span>
          </div>
        </div>
      </section>

      <!-- 🚪 Выход — на десктопе живёт в сайдбаре -->
      <div class="rounded-[20px] border border-border bg-white p-2 shadow-sm lg:hidden">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-[13px] px-3.5 py-3 text-[15px] font-bold text-red-600 transition-colors hover:bg-red-50"
          @click="authStore.signOut()"
        >
          <Icon name="lucide:log-out" class="size-[21px] flex-none" />
          <span>Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  </ProfileShell>
</template>
