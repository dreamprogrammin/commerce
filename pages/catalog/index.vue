<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

definePageMeta({ layout: 'catalog' })
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

// Определяем размер карточки
function getCategorySize(category: CategoryRow): 'small' | 'medium' | 'large' {
  const order = (category as any).featured_order ?? 0
  if (order >= 67)
    return 'large'
  if (order >= 34)
    return 'medium'
  return 'small'
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
    <div class="px-2 py-4">
      <!-- Загрузка -->
      <div v-if="categoriesStore.isLoading" class="grid grid-cols-2 gap-2 auto-rows-[200px]">
        <Skeleton v-for="i in 6" :key="i" class="w-full h-full rounded-2xl" />
      </div>

      <div v-else class="space-y-2">
        <!-- Блоки Акции и Новинки -->
        <div v-if="additionalItems.length > 0" class="grid grid-cols-2 gap-2">
          <NuxtLink
            v-for="item in additionalItems"
            :key="item.id"
            :to="item.href"
            class="relative block overflow-hidden rounded-2xl h-[200px] shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200"
          >
            <div
              class="relative h-full bg-gradient-to-br" :class="[
                additionalItemGradients[item.id as keyof typeof additionalItemGradients] || 'from-primary to-primary/80',
              ]"
            >
              <!-- Декоративные элементы -->
              <div class="absolute inset-0 bg-black/5" />

              <!-- Контент - название внизу -->
              <div class="absolute bottom-0 left-0 right-0 p-4">
                <h3 class="text-lg font-bold text-white drop-shadow-md">
                  {{ item.name }}
                </h3>
              </div>

              <!-- Иконка в центре справа -->
              <div class="absolute right-4 top-1/2 -translate-y-1/2">
                <Icon
                  :name="item.icon || 'lucide:star'"
                  class="w-20 h-20 text-white/30 drop-shadow-lg"
                />
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Сетка категорий -->
        <div v-if="secondLevelCategories.length > 0" class="grid grid-cols-2 gap-2 auto-rows-[200px]">
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="relative block overflow-hidden rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 animate-fadeInUp opacity-0 bg-card" :class="[
              getCategorySize(category) === 'large' ? 'row-span-2 h-auto'
              : getCategorySize(category) === 'medium' ? 'row-span-2 h-auto'
                : 'h-[200px]',
            ]"
            :style="{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }"
          >
            <!-- Изображение -->
            <div v-if="category.image_url" class="absolute inset-0">
              <img
                :src="getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, IMAGE_SIZES.CATEGORY_MENU) || undefined"
                :alt="category.name"
                class="w-full h-full object-contain p-4"
                loading="lazy"
              >
            </div>

            <!-- Фоллбэк без изображения -->
            <div v-else class="absolute inset-0 bg-muted flex items-center justify-center p-4">
              <Icon
                :name="category.icon_name || 'lucide:package'"
                class="w-20 h-20 text-muted-foreground opacity-40"
              />
            </div>

            <!-- Контент карточки - только название внизу -->
            <div class="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-sm">
              <h3 class="font-semibold leading-tight text-foreground text-sm">
                {{ category.name }}
              </h3>
            </div>
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
