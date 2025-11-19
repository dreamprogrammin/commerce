<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
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
  
  // Загружаем категории
  await categoriesStore.fetchCategoryData()
  
  // Получаем подкатегории второго уровня
  const secondLevelCategories = computed<CategoryRow[]>(() => {
    const allCats = categoriesStore.allCategories
  
    return allCats
      .filter((cat) => {
        // Должен быть parent_id
        if (!cat.parent_id)
          return false
  
        // Родитель должен быть root категорией
        const parent = allCats.find(c => c.id === cat.parent_id)
        return parent?.is_root_category === true
      })
      .sort((a, b) => a.display_order - b.display_order)
  })
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
        <div v-if="categoriesStore.isLoading" class="masonry-container">
          <div v-for="i in 6" :key="i" class="masonry-item">
            <Skeleton class="w-full aspect-[3/4] rounded-xl" />
          </div>
        </div>
  
        <!-- Масонри-сетка категорий -->
        <div v-else-if="secondLevelCategories.length > 0" class="masonry-container">
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="masonry-item"
            :style="{ animationDelay: `${index * 50}ms` }"
          >
            <Card class="category-card group overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow">
              <!-- Изображение -->
              <div v-if="category.image_url" class="category-image">
                <img
                  :src="getImageUrl('categories', category.image_url, {
                    width: 400,
                    quality: 80,
                    format: 'webp',
                  })"
                  :alt="category.name"
                  class="w-full h-full object-cover group-active:scale-95 transition-transform duration-200"
                  loading="lazy"
                >
                <!-- Градиент оверлей -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              </div>
  
              <!-- Фоллбэк без изображения -->
              <div v-else class="category-placeholder">
                <Icon
                  :name="category.icon_name || 'lucide:package'"
                  class="w-12 h-12 text-muted-foreground"
                />
              </div>
  
              <!-- Контент карточки -->
              <div class="category-content">
                <h3 class="category-title">
                  {{ category.name }}
                </h3>
                <p v-if="category.description" class="category-description">
                  {{ category.description }}
                </p>
  
                <!-- Иконка стрелки -->
                <div class="category-arrow">
                  <Icon
                    name="lucide:chevron-right"
                    class="w-5 h-5 text-white group-active:translate-x-1 transition-transform duration-200"
                  />
                </div>
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
  </template>
  
  <style scoped>
  /* Масонри через CSS Columns - идеально для мобилки */
  .masonry-container {
    column-count: 2;
    column-gap: 0.75rem;
    margin: 0 auto;
  }
  
  .masonry-item {
    display: inline-block;
    width: 100%;
    margin-bottom: 0.75rem;
    break-inside: avoid;
    animation: fadeInUp 0.4s ease-out forwards;
    opacity: 0;
  }
  
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
  
  /* Карточка категории */
  .category-card {
    position: relative;
    display: block;
    cursor: pointer;
  }
  
  .category-card:active {
    transform: scale(0.98);
    transition: transform 0.1s;
  }
  
  /* Изображение */
  .category-image {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 4;
    overflow: hidden;
    border-radius: calc(var(--radius) - 2px);
  }
  
  /* Плейсхолдер без изображения */
  .category-placeholder {
    width: 100%;
    aspect-ratio: 3 / 4;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%);
    border-radius: calc(var(--radius) - 2px);
  }
  
  /* Контент */
  .category-content {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 1rem;
    color: white;
  }
  
  .category-title {
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.3;
    margin-bottom: 0.25rem;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }
  
  .category-description {
    font-size: 0.875rem;
    line-height: 1.4;
    opacity: 0.95;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  
  .category-arrow {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 2rem;
    height: 2rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  /* Адаптация для очень маленьких экранов */
  @media (max-width: 360px) {
    .masonry-container {
      column-count: 1;
    }
  }
  
  /* Для больших мобильных телефонов */
  @media (min-width: 480px) {
    .masonry-container {
      column-gap: 1rem;
    }
    
    .masonry-item {
      margin-bottom: 1rem;
    }
  }
  </style>