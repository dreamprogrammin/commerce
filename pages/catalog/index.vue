<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

// SEO
useHead({
  title: 'Каталог товаров',
  meta: [
    { name: 'description', content: 'Просмотрите наш каталог детских товаров' },
  ],
})

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

// Загружаем категории и дополнительные пункты меню
await Promise.all([
  categoriesStore.fetchCategoryData(),
  categoriesStore.fetchAdditionalMenuItems(),
])

// Дополнительные пункты (Акции, Новинки)
const additionalItems = computed(() => categoriesStore.additionalMenuItems)

// Получаем подкатегории второго уровня
const secondLevelCategories = computed<CategoryRow[]>(() => {
  const allCats = categoriesStore.allCategories

  return allCats
    .filter((cat) => {
      if (!cat.parent_id)
        return false
      const parent = allCats.find(c => c.id === cat.parent_id)
      return parent?.is_root_category === true
    })
    .sort((a, b) => a.display_order - b.display_order)
})

// Определяем размер карточки (упрощено: большой или маленький)
function isLargeCard(category: CategoryRow): boolean {
  const order = (category as any).featured_order ?? 0
  return order >= 50 // >= 50 = большая, < 50 = маленькая
}

// Градиенты для дополнительных блоков
const additionalItemGradients = {
  new: 'from-blue-500 to-purple-600',
  sale: 'from-red-500 to-pink-600',
}
</script>

<template>
  <div class="min-h-screen bg-background pb-20">
    <!-- Шапка с навигацией -->
    <div class="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div class="px-4 py-3">
        <h1 class="text-2xl font-bold">
          Каталог
        </h1>
      </div>
    </div>

    <!-- Основной контент -->
    <div class="px-4 py-6">
      <!-- Загрузка -->
      <div v-if="categoriesStore.isLoading" class="grid grid-cols-2 gap-3 auto-rows-[180px]">
        <Skeleton v-for="i in 6" :key="i" class="w-full h-full rounded-xl" />
      </div>

      <div v-else class="space-y-4">
        <!-- Блоки Акции и Новинки -->
        <div v-if="additionalItems.length > 0" class="grid grid-cols-2 gap-3">
          <NuxtLink
            v-for="item in additionalItems"
            :key="item.id"
            :to="item.href"
            class="relative block overflow-hidden rounded-xl h-[140px] shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200"
          >
            <div
              class="relative h-full bg-gradient-to-br" :class="[
                additionalItemGradients[item.id as keyof typeof additionalItemGradients] || 'from-primary to-primary/80',
              ]"
            >
              <!-- Декоративные элементы -->
              <div class="absolute inset-0 bg-black/10" />
              <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
              <div class="absolute -left-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl" />

              <!-- Контент -->
              <div class="relative h-full flex flex-col items-center justify-center text-white p-4">
                <Icon
                  :name="item.icon || 'lucide:star'"
                  class="w-10 h-10 mb-2 drop-shadow-lg"
                />
                <h3 class="text-base font-bold drop-shadow-md text-center">
                  {{ item.name }}
                </h3>
              </div>

              <!-- Иконка стрелки -->
              <div class="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon
                  name="lucide:chevron-right"
                  class="w-3 h-3 text-white"
                />
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Сетка категорий -->
        <div v-if="secondLevelCategories.length > 0" class="grid grid-cols-2 gap-3 auto-rows-[180px]">
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="relative block overflow-hidden rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 animate-fadeInUp opacity-0" :class="[
              isLargeCard(category) ? 'row-span-2 h-auto' : 'h-[180px]',
            ]"
            :style="{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }"
          >
            <Card class="relative h-full overflow-hidden border-0">
              <!-- Изображение -->
              <div v-if="category.image_url" class="relative w-full h-full">
                <img
                  :src="getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, IMAGE_SIZES.CATEGORY_MENU) || undefined"
                  :alt="category.name"
                  class="w-full h-full object-cover"
                  loading="lazy"
                >
              </div>

              <!-- Фоллбэк без изображения -->
              <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/10">
                <Icon
                  :name="category.icon_name || 'lucide:package'"
                  class="w-12 h-12 text-muted-foreground"
                />
              </div>

              <!-- Контент карточки с градиентом -->
              <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent text-white">
                <h3
                  class="font-semibold leading-tight drop-shadow-md" :class="[
                    isLargeCard(category) ? 'text-lg mb-1' : 'text-base',
                  ]"
                >
                  {{ category.name }}
                </h3>
                <p
                  v-if="category.description && isLargeCard(category)"
                  class="text-xs leading-snug opacity-90 drop-shadow-sm line-clamp-2 mt-1"
                >
                  {{ category.description }}
                </p>
              </div>

              <!-- Иконка стрелки -->
              <div class="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon
                  name="lucide:chevron-right"
                  class="w-4 h-4 text-white"
                />
              </div>
            </Card>
          </NuxtLink>
        </div>

        <!-- Пустое состояние -->
        <Card v-else class="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="lucide:package-open" class="w-16 h-16 text-muted-foreground mb-4" />
          <CardTitle class="mb-2">
            Категории не найдены
          </CardTitle>
          <CardDescription>
            Попробуйте обновить страницу или вернуться позже
          </CardDescription>
        </Card>
      </div>
    </div>
  </div>
</template>

<style>
/* Только анимация - её нельзя сделать через Tailwind inline */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeInUp {
  animation: fadeInUp 0.4s ease-out;
}
</style>
