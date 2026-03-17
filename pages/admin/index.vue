<script setup lang="ts">
import type { Database } from '@/types'
import {
  ArrowUpRight,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

definePageMeta({ layout: 'admin' })

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

interface DashboardStats {
  revenue_month: number
  revenue_total: number
  orders_month: number
  orders_total: number
  orders_pending: number
  orders_delivered: number
  avg_order_month: number
  top_products: {
    id: string
    name: string
    price: number
    sales_count: number
    image_url: string | null
  }[]
  revenue_by_day: {
    day: string
    revenue: number
    order_count: number
  }[]
}

const stats = ref<DashboardStats | null>(null)
const isLoading = ref(true)

async function fetchStats() {
  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('get_dashboard_stats')
    if (error)
      throw error
    stats.value = data as unknown as DashboardStats
  }
  catch (error: any) {
    toast.error('Ошибка загрузки статистики', { description: error.message })
  }
  finally {
    isLoading.value = false
  }
}

onMounted(fetchStats)

// Форматирование цены
function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

// Максимум продаж для прогресс-бара
const maxSales = computed(() => {
  if (!stats.value?.top_products?.length)
    return 1
  return stats.value.top_products[0].sales_count || 1
})

// Макс выручка за день для графика
const maxDayRevenue = computed(() => {
  if (!stats.value?.revenue_by_day?.length)
    return 1
  return Math.max(...stats.value.revenue_by_day.map(d => d.revenue)) || 1
})

// Названия дней недели
function formatDayShort(dateStr: string): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  const date = new Date(dateStr)
  return days[date.getDay()]
}

function formatDayFull(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// Картинка товара
function getProductImage(imageUrl: string | null): string | undefined {
  if (!imageUrl)
    return undefined
  return getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm') || undefined
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Дашборд
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Обзор ключевых показателей магазина
        </p>
      </div>
      <Button variant="outline" size="sm" :disabled="isLoading" @click="fetchStats">
        <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': isLoading }" />
        Обновить
      </Button>
    </div>

    <!-- Скелетоны -->
    <template v-if="isLoading">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card v-for="i in 4" :key="i">
          <CardHeader class="pb-2">
            <Skeleton class="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton class="h-8 w-32" />
            <Skeleton class="h-3 w-20 mt-2" />
          </CardContent>
        </Card>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <Skeleton class="h-5 w-48" />
          </CardHeader>
          <CardContent class="space-y-4">
            <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton class="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton class="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- Данные -->
    <template v-else-if="stats">
      <!-- Карточки статистики -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Выручка за месяц -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">
              Выручка / мес
            </CardTitle>
            <DollarSign class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ formatPrice(stats.revenue_month) }} ₸
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Всего: {{ formatPrice(stats.revenue_total) }} ₸
            </p>
          </CardContent>
        </Card>

        <!-- Заказы за месяц -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">
              Заказы / мес
            </CardTitle>
            <ShoppingCart class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ stats.orders_month }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Всего: {{ stats.orders_total }}
            </p>
          </CardContent>
        </Card>

        <!-- Ожидают обработки -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">
              Новые
            </CardTitle>
            <Clock class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold" :class="stats.orders_pending > 0 ? 'text-orange-500' : ''">
              {{ stats.orders_pending }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Ожидают обработки
            </p>
          </CardContent>
        </Card>

        <!-- Средний чек -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between pb-2">
            <CardTitle class="text-sm font-medium">
              Средний чек
            </CardTitle>
            <TrendingUp class="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ formatPrice(stats.avg_order_month) }} ₸
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              За текущий месяц
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Графики -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- ТОП-5 товаров -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg flex items-center gap-2">
              <Package class="w-5 h-5" />
              Топ-5 товаров
            </CardTitle>
            <p class="text-sm text-muted-foreground">
              По количеству продаж
            </p>
          </CardHeader>
          <CardContent class="space-y-4">
            <div v-if="stats.top_products.length === 0" class="text-center py-8 text-muted-foreground">
              Пока нет данных о продажах
            </div>
            <div
              v-for="(product, index) in stats.top_products"
              :key="product.id"
              class="flex items-center gap-3"
            >
              <!-- Позиция -->
              <span class="text-sm font-bold text-muted-foreground w-5 text-right">
                {{ index + 1 }}
              </span>

              <!-- Изображение -->
              <div class="w-10 h-10 rounded-md bg-muted flex-shrink-0 overflow-hidden">
                <img
                  v-if="getProductImage(product.image_url)"
                  :src="getProductImage(product.image_url)"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                >
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Package class="w-4 h-4 text-muted-foreground" />
                </div>
              </div>

              <!-- Информация -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-sm font-medium truncate">
                    {{ product.name }}
                  </p>
                  <Badge variant="secondary" class="flex-shrink-0">
                    {{ product.sales_count }} шт
                  </Badge>
                </div>
                <div class="mt-1">
                  <Progress
                    :model-value="(product.sales_count / maxSales) * 100"
                    class="h-2"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Выручка за 7 дней -->
        <Card>
          <CardHeader>
            <CardTitle class="text-lg flex items-center gap-2">
              <TrendingUp class="w-5 h-5" />
              Выручка за 7 дней
            </CardTitle>
            <p class="text-sm text-muted-foreground">
              Динамика продаж по дням
            </p>
          </CardHeader>
          <CardContent>
            <div v-if="!stats.revenue_by_day.length" class="text-center py-8 text-muted-foreground">
              Нет данных за последние 7 дней
            </div>
            <!-- Столбчатый график на Tailwind -->
            <div v-else class="flex items-end gap-2 h-48">
              <div
                v-for="day in stats.revenue_by_day"
                :key="day.day"
                class="flex-1 flex flex-col items-center gap-1"
              >
                <!-- Значение над столбцом -->
                <span class="text-[10px] text-muted-foreground whitespace-nowrap">
                  {{ day.revenue > 0 ? `${formatPrice(day.revenue)}` : '' }}
                </span>

                <!-- Столбец -->
                <div class="w-full flex items-end justify-center" style="height: 160px">
                  <div
                    class="w-full max-w-10 rounded-t-md transition-all duration-500"
                    :class="day.revenue > 0 ? 'bg-primary' : 'bg-muted'"
                    :style="{
                      height: day.revenue > 0
                        ? `${Math.max((day.revenue / maxDayRevenue) * 100, 8)}%`
                        : '4px',
                    }"
                  />
                </div>

                <!-- День -->
                <div class="text-center">
                  <p class="text-xs font-medium">
                    {{ formatDayShort(day.day) }}
                  </p>
                  <p class="text-[10px] text-muted-foreground">
                    {{ formatDayFull(day.day) }}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Быстрые ссылки -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <NuxtLink to="/admin/products" class="block">
          <Card class="hover:border-primary transition-colors">
            <CardContent class="pt-6 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Товары
                </p>
                <p class="text-xs text-muted-foreground">
                  Управление
                </p>
              </div>
              <ArrowUpRight class="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/admin/categories" class="block">
          <Card class="hover:border-primary transition-colors">
            <CardContent class="pt-6 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Категории
                </p>
                <p class="text-xs text-muted-foreground">
                  Меню сайта
                </p>
              </div>
              <ArrowUpRight class="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/admin/brands" class="block">
          <Card class="hover:border-primary transition-colors">
            <CardContent class="pt-6 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Бренды
                </p>
                <p class="text-xs text-muted-foreground">
                  Каталог
                </p>
              </div>
              <ArrowUpRight class="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/admin/suppliers" class="block">
          <Card class="hover:border-primary transition-colors">
            <CardContent class="pt-6 flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">
                  Поставщики
                </p>
                <p class="text-xs text-muted-foreground">
                  База контактов
                </p>
              </div>
              <ArrowUpRight class="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
