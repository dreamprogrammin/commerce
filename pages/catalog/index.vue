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

// Современные яркие градиенты
const additionalItemStyles = {
  new: {
    gradient: 'from-emerald-400 via-green-400 to-teal-400',
    shadow: 'shadow-emerald-500/30',
  },
  sale: {
    gradient: 'from-yellow-400 via-amber-400 to-orange-400',
    shadow: 'shadow-yellow-500/30',
  },
}
</script>

<template>
  <div class="min-h-screen bg-background pb-20">
    <!-- Шапка с навигацией -->
    <div class="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b sr-only">
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
        <!-- Блоки Акции и Новинки - Современный дизайн -->
        <div v-if="additionalItems.length > 0" class="grid grid-cols-2 gap-2">
          <NuxtLink
            v-for="item in additionalItems"
            :key="item.id"
            :to="item.href"
            class="relative block overflow-hidden rounded-3xl h-[200px] hover:shadow-2xl active:scale-[0.97] transition-all duration-300 group"
            :class="additionalItemStyles[item.id as keyof typeof additionalItemStyles]?.shadow || 'shadow-lg'"
          >
            <div
              class="relative h-full bg-gradient-to-br overflow-hidden"
              :class="additionalItemStyles[item.id as keyof typeof additionalItemStyles]?.gradient || 'from-primary to-primary/80'"
            >
              <!-- Анимированные декоративные элементы -->
              <div class="absolute top-0 right-0 w-full h-full animate-float-slow">
                <div class="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
              </div>
              <div class="absolute bottom-0 left-0 w-full h-full animate-float">
                <div class="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
              </div>

              <!-- Сетка паттерн -->
              <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 20px 20px;" />

              <!-- Градиент для текста -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

              <!-- Эмодзи - с анимацией и эффектами -->
              <div class="absolute -top-3 -right-3 z-10 transform group-hover:scale-110 group-hover:rotate-0 rotate-12 transition-all duration-500 ease-out animate-pulse-slow">
                <div class="relative">
                  <!-- Свечение за эмодзи -->
                  <div class="absolute inset-0 blur-2xl opacity-50 scale-150">
                    <span class="text-9xl">
                      {{ item.id === 'sale' ? '🏷️' : '⭐' }}
                    </span>
                  </div>
                  <!-- Само эмодзи -->
                  <span class="relative text-9xl drop-shadow-2xl filter brightness-110">
                    {{ item.id === 'sale' ? '🏷️' : '⭐' }}
                  </span>
                </div>
              </div>

              <!-- Контент - название с современной типографикой -->
              <div class="absolute left-0 top-1/2 -translate-y-1/2 p-5 z-10 max-w-[55%]">
                <div class="space-y-1">
                  <h3 class="text-2xl font-black text-white drop-shadow-lg leading-tight tracking-tight">
                    {{ item.name }}
                  </h3>
                  <div class="h-1 w-12 bg-white/80 rounded-full group-hover:w-16 transition-all duration-300" />
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Сетка категорий -->
        <div v-if="secondLevelCategories.length > 0" class="grid grid-cols-2 gap-2 auto-rows-[120px]">
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="relative block overflow-hidden rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 animate-fadeInUp opacity-0 bg-card" :class="[
              getCategorySize(category) === 'large' ? 'row-span-2'
              : getCategorySize(category) === 'medium' ? 'row-span-2'
                : 'row-span-1',
            ]"
            :style="{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }"
          >
            <!-- Изображение в правом нижнем углу -->
            <div v-if="category.image_url" class="absolute bottom-0 right-0 w-[85%] h-[85%]">
              <img
                :src="getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, IMAGE_SIZES.CATEGORY_MENU) || undefined"
                :alt="category.name"
                class="w-full h-full object-contain object-bottom"
                loading="lazy"
              >
            </div>

            <!-- Фоллбэк без изображения -->
            <div v-else class="absolute bottom-0 right-0 w-[85%] h-[85%] flex items-end justify-center">
              <Icon
                :name="category.icon_name || 'lucide:package'"
                class="w-20 h-20 text-muted-foreground opacity-30"
              />
            </div>

            <!-- Контент карточки - название в левом верхнем углу -->
            <div class="absolute top-0 left-0 p-4 max-w-[70%]">
              <h3 class="font-medium leading-tight text-foreground text-sm">
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
/* Анимации */
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

@keyframes float {
  0%,
  100% {
    transform: translateY(0px) translateX(0px);
  }
  50% {
    transform: translateY(-20px) translateX(10px);
  }
}

@keyframes float-slow {
  0%,
  100% {
    transform: translateY(0px) translateX(0px);
  }
  50% {
    transform: translateY(-15px) translateX(-10px);
  }
}

@keyframes pulse-slow {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.9;
  }
}

.animate-fadeInUp {
  animation: fadeInUp 0.4s ease-out;
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-float-slow {
  animation: float-slow 8s ease-in-out infinite;
}

.animate-pulse-slow {
  animation: pulse-slow 3s ease-in-out infinite;
}
</style>
