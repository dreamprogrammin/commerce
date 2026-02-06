<script setup lang="ts">
import { ArrowDownCircle, ArrowRight, ArrowUpCircle, Gift, Heart, Package, ShoppingBag, Star, User } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

// --- Stores ---
const authStore = useAuthStore()
const profileStore = useProfileStore()
const wishlistStore = useWishlistStore()
const { getPublicUrl } = useSupabaseStorage()

// --- Данные профиля ---
const { profile, fullName, bonusBalance, isLoading: isLoadingProfile, pendingBonuses } = storeToRefs(profileStore)
const { user } = storeToRefs(authStore)

// --- Заказы ---
const { orders, isLoading: isLoadingOrders, fetchOrders, getStatusColor, getStatusLabel } = useUserOrders()

// --- Избранное ---
const { wishlistProducts, isLoading: isLoadingWishlist } = storeToRefs(wishlistStore)
const { fetchWishlistProducts } = wishlistStore

// --- Бонусные транзакции ---
const supabase = useSupabaseClient()
const bonusTransactions = ref<any[]>([])
const isLoadingBonuses = ref(false)

// --- Computed ---
const recentOrders = computed(() => ordersData.value || [])
const recentWishlist = computed(() => wishlistData.value || [])

const userInitial = computed(() => {
  if (fullName.value)
    return fullName.value.charAt(0).toUpperCase()
  if (user.value?.email)
    return user.value.email.charAt(0).toUpperCase()
  return 'U'
})

// --- Методы ---
async function loadBonusTransactions() {
  isLoadingBonuses.value = true
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
  finally {
    isLoadingBonuses.value = false
  }
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(dateString))
}

function getTransactionIcon(type: string) {
  switch (type) {
    case 'earned':
    case 'refund_spent':
      return ArrowUpCircle
    case 'spent':
    case 'refund_earned':
      return ArrowDownCircle
    case 'welcome':
      return Gift
    default:
      return Star
  }
}

function getTransactionColor(type: string) {
  switch (type) {
    case 'earned':
    case 'welcome':
    case 'refund_spent':
      return 'text-green-600'
    case 'spent':
    case 'refund_earned':
      return 'text-red-600'
    default:
      return 'text-muted-foreground'
  }
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

// --- Инициализация ---
onMounted(async () => {
  // ✅ Сначала дожидаемся загрузки профиля
  if (!profile.value && !isLoadingProfile.value) {
    await profileStore.loadProfile(false, true)
  }

  // TanStack Query автоматически загружает данные параллельно
})

// --- Meta ---
definePageMeta({
  layout: 'profile',
})

useHead({
  title: 'Мой профиль',
})
</script>

<template>
  <div class="space-y-6">
    <!-- Приветствие -->
    <div class="flex items-center gap-4">
      <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
        <span class="text-2xl font-bold text-primary">{{ userInitial }}</span>
      </div>
      <div>
        <h1 class="text-2xl font-bold">
          {{ fullName || 'Пользователь' }}
        </h1>
        <p class="text-muted-foreground">
          {{ user?.email }}
        </p>
      </div>
    </div>

    <!-- Быстрые карточки -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <!-- Бонусы -->
      <NuxtLink to="/profile/bonus" class="group">
        <Card class="h-full hover:shadow-md transition-shadow">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <Star class="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span class="text-xs text-muted-foreground">Бонусы</span>
            </div>
            <p class="text-2xl font-bold">
              {{ bonusBalance.toLocaleString('ru-RU') }}
            </p>
            <p v-if="pendingBonuses > 0" class="text-xs text-muted-foreground mt-1">
              +{{ pendingBonuses }} ожидают
            </p>
          </CardContent>
        </Card>
      </NuxtLink>

      <!-- Заказы -->
      <NuxtLink to="/profile/order" class="group">
        <Card class="h-full hover:shadow-md transition-shadow">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <Package class="w-4 h-4 text-blue-500" />
              <span class="text-xs text-muted-foreground">Заказы</span>
            </div>
            <p class="text-2xl font-bold">
              {{ ordersData?.length || 0 }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              последние
            </p>
          </CardContent>
        </Card>
      </NuxtLink>

      <!-- Избранное -->
      <NuxtLink to="/profile/wishlist" class="group">
        <Card class="h-full hover:shadow-md transition-shadow">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <Heart class="w-4 h-4 text-red-500" />
              <span class="text-xs text-muted-foreground">Избранное</span>
            </div>
            <p class="text-2xl font-bold">
              {{ wishlistData?.length || 0 }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              последние
            </p>
          </CardContent>
        </Card>
      </NuxtLink>

      <!-- Настройки -->
      <NuxtLink to="/profile/settings" class="group">
        <Card class="h-full hover:shadow-md transition-shadow">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-2">
              <User class="w-4 h-4 text-gray-500" />
              <span class="text-xs text-muted-foreground">Профиль</span>
            </div>
            <p class="text-sm font-medium mt-2">
              Настройки
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              данные
            </p>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <!-- Последние заказы -->
    <Card>
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">
            Последние заказы
          </CardTitle>
          <Button v-if="ordersData && ordersData.length > 0" variant="ghost" size="sm" as-child>
            <NuxtLink to="/profile/order" class="flex items-center gap-1">
              Все заказы
              <ArrowRight class="w-4 h-4" />
            </NuxtLink>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <!-- Загрузка -->
        <div v-if="isLoadingOrdersQuery" class="space-y-3">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!ordersData || ordersData.length === 0" class="text-center py-8">
          <ShoppingBag class="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p class="text-muted-foreground mb-4">
            У вас пока нет заказов
          </p>
          <Button as-child>
            <NuxtLink to="/catalog/all">
              Перейти в каталог
            </NuxtLink>
          </Button>
        </div>

        <!-- Список -->
        <div v-else class="space-y-3">
          <NuxtLink
            v-for="order in recentOrders"
            :key="order.id"
            :to="`/profile/order/${order.id}`"
            class="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div class="flex items-center gap-3">
              <!-- Превью товаров -->
              <div class="flex -space-x-2">
                <div
                  v-for="(item, idx) in order.order_items.slice(0, 3)"
                  :key="item.id"
                  class="w-10 h-10 rounded-lg bg-muted overflow-hidden border-2 border-background"
                  :style="{ zIndex: 3 - idx }"
                >
                  <ProgressiveImage
                    v-if="item.product.product_images?.[0]"
                    :src="getPublicUrl(BUCKET_NAME_PRODUCT, item.product.product_images[0].image_url)"
                    :alt="item.product.name"
                    aspect-ratio="square"
                    object-fit="cover"
                    eager
                  />
                </div>
                <div
                  v-if="order.order_items.length > 3"
                  class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center border-2 border-background text-xs font-medium"
                >
                  +{{ order.order_items.length - 3 }}
                </div>
              </div>
              <div>
                <p class="font-medium text-sm">
                  №{{ order.id.slice(-6) }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ formatDate(order.created_at) }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <Badge :class="getStatusColor(order.status)" class="mb-1">
                {{ getStatusLabel(order.status) }}
              </Badge>
              <p class="text-sm font-semibold">
                {{ order.final_amount.toLocaleString('ru-RU') }} ₸
              </p>
            </div>
          </NuxtLink>
        </div>
      </CardContent>
    </Card>

    <!-- Избранное -->
    <Card>
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">
            Избранное
          </CardTitle>
          <Button v-if="wishlistData && wishlistData.length > 0" variant="ghost" size="sm" as-child>
            <NuxtLink to="/profile/wishlist" class="flex items-center gap-1">
              Все товары
              <ArrowRight class="w-4 h-4" />
            </NuxtLink>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <!-- Загрузка -->
        <div v-if="isLoadingWishlistQuery" class="grid grid-cols-4 gap-3">
          <Skeleton v-for="i in 4" :key="i" class="aspect-square rounded-lg" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!wishlistData || wishlistData.length === 0" class="text-center py-8">
          <Heart class="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p class="text-muted-foreground mb-4">
            Список избранного пуст
          </p>
          <Button variant="outline" as-child>
            <NuxtLink to="/catalog/all">
              Найти товары
            </NuxtLink>
          </Button>
        </div>

        <!-- Сетка товаров -->
        <div v-else class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <NuxtLink
            v-for="product in recentWishlist"
            :key="product.id"
            :to="`/catalog/products/${product.slug}`"
            class="group"
          >
            <div class="aspect-square rounded-lg bg-muted overflow-hidden mb-2">
              <ProgressiveImage
                v-if="product.product_images?.[0]"
                :src="getPublicUrl(BUCKET_NAME_PRODUCT, product.product_images[0].image_url)"
                :blur-data-url="product.product_images[0].blur_placeholder"
                :alt="product.name"
                aspect-ratio="square"
                object-fit="cover"
                placeholder-type="lqip"
                class="group-hover:scale-105 transition-transform"
              />
            </div>
            <p class="text-sm font-medium line-clamp-2">
              {{ product.name }}
            </p>
            <p class="text-sm font-bold text-primary">
              {{ product.price.toLocaleString('ru-RU') }} ₸
            </p>
          </NuxtLink>
        </div>
      </CardContent>
    </Card>

    <!-- Последние бонусные операции -->
    <Card>
      <CardHeader class="pb-3">
        <div class="flex items-center justify-between">
          <CardTitle class="text-lg">
            Бонусные операции
          </CardTitle>
          <Button v-if="bonusData && bonusData.length > 0" variant="ghost" size="sm" as-child>
            <NuxtLink to="/profile/bonus" class="flex items-center gap-1">
              История
              <ArrowRight class="w-4 h-4" />
            </NuxtLink>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <!-- Загрузка -->
        <div v-if="isLoadingBonusQuery" class="space-y-3">
          <Skeleton class="h-12 w-full" />
          <Skeleton class="h-12 w-full" />
        </div>

        <!-- Пусто -->
        <div v-else-if="!bonusData || bonusData.length === 0" class="text-center py-8">
          <Star class="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p class="text-muted-foreground">
            Пока нет операций с бонусами
          </p>
        </div>

        <!-- Список -->
        <div v-else class="space-y-2">
          <div
            v-for="tx in bonusData"
            :key="tx.id"
            class="flex items-center justify-between p-3 rounded-lg bg-muted/50"
          >
            <div class="flex items-center gap-3">
              <component
                :is="getTransactionIcon(tx.transaction_type)"
                class="w-5 h-5" :class="[getTransactionColor(tx.transaction_type)]"
              />
              <div>
                <p class="text-sm font-medium">
                  {{ tx.transaction_type === 'earned' ? 'Начисление'
                    : tx.transaction_type === 'spent' ? 'Списание'
                      : tx.transaction_type === 'welcome' ? 'Приветственный бонус'
                        : tx.transaction_type === 'refund_spent' ? 'Возврат' : 'Операция' }}
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ formatDate(tx.created_at) }}
                </p>
              </div>
            </div>
            <span
              class="font-semibold" :class="[
                tx.amount > 0 ? 'text-green-600' : 'text-red-600',
              ]"
            >
              {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }} ₸
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Выход -->
    <div class="pt-4 border-t">
      <Button variant="outline" class="text-destructive hover:text-destructive" @click="authStore.signOut()">
        Выйти из аккаунта
      </Button>
    </div>
  </div>
</template>
