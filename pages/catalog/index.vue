<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

definePageMeta({ layout: 'catalog' })

// ========================================
// SEO META TAGS
// ========================================
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const catalogUrl = `${siteUrl}/catalog`

const metaTitle = 'Каталог детских игрушек - Купить игрушки для детей в Алматы | Ухтышка'
const metaDescription = 'Полный каталог детских игрушек в интернет-магазине Ухтышка ⭐ Развивающие игры, конструкторы, куклы, машинки для детей всех возрастов ✓ Доставка по Казахстану ✓ Бонусная программа'

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

// 🚀 Оптимизированный useAsyncData: неблокирующий + SSR + кеширование
const { data: catalogData, pending } = useAsyncData(
  'catalog-page',
  async () => {
    await Promise.all([
      categoriesStore.fetchCategoryData(),
      categoriesStore.fetchAdditionalMenuItems(),
    ])

    return {
      categories: categoriesStore.allCategories,
      additional: categoriesStore.additionalMenuItems,
    }
  },
  {
    lazy: true, // ✅ Неблокирующая загрузка - страница рендерится сразу
    server: true, // ✅ SSR сохраняется для SEO
    dedupe: 'defer', // ✅ Предотвращает дублирующие запросы
    // ✅ Упрощенное кеширование
    getCachedData(key) {
      const data = useNuxtData(key)
      return data.data.value
    },
  },
)

// Получаем подкатегории второго уровня
const secondLevelCategories = computed<CategoryRow[]>(() => {
  const allCats = catalogData.value?.categories || []

  return allCats
    .filter((cat) => {
      if (!cat.parent_id)
        return false
      const parent = allCats.find(c => c.id === cat.parent_id)
      return parent?.is_root_category === true
    })
    .sort((a, b) => a.display_order - b.display_order)
})

// 🔥 SEO - Динамические мета-теги + structured data с категориями
useHead(() => {
  const schemas = [
    // BreadcrumbList Schema
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': [
          {
            '@type': 'ListItem',
            'position': 1,
            'name': 'Главная',
            'item': siteUrl,
          },
          {
            '@type': 'ListItem',
            'position': 2,
            'name': 'Каталог',
            'item': catalogUrl,
          },
        ],
      }),
    },
    // CollectionPage Schema
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': 'Каталог детских игрушек',
        'description': metaDescription,
        'url': catalogUrl,
        'isPartOf': {
          '@type': 'WebSite',
          'name': siteName,
          'url': siteUrl,
        },
      }),
    },
  ]

  // 🔥 Добавляем ItemList schema для категорий (важно для Google!)
  if (secondLevelCategories.value.length > 0) {
    schemas.push({
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': 'Категории товаров',
        'description': 'Категории детских игрушек в интернет-магазине Ухтышка',
        'numberOfItems': secondLevelCategories.value.length,
        'itemListElement': secondLevelCategories.value.map((category, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'url': `${siteUrl}${category.href}`,
          'name': category.name,
          'image': category.image_url
            ? getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, {
                width: 400,
                height: 400,
                quality: 80,
                format: 'webp',
              })
            : undefined,
        })),
      }),
    })
  }

  return {
    title: metaTitle,
    link: [
      { rel: 'canonical', href: catalogUrl },
    ],
    meta: [
      { name: 'description', content: metaDescription },
      { name: 'keywords', content: 'каталог игрушек, детские товары, игрушки Алматы, купить игрушки, категории игрушек' },

      // Open Graph
      { property: 'og:title', content: metaTitle },
      { property: 'og:description', content: metaDescription },
      { property: 'og:url', content: catalogUrl },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: siteName },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:image', content: `${siteUrl}/og-catalog.jpeg` },

      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: metaTitle },
      { name: 'twitter:description', content: metaDescription },
      { name: 'twitter:image', content: `${siteUrl}/og-catalog.jpeg` },

      // Robots
      { name: 'robots', content: 'index, follow' },
    ],
    script: schemas,
  }
})

// Robots правило
useRobotsRule({
  index: true,
  follow: true,
})

// ✅ Показываем skeleton только если идёт загрузка И данных нет
const showSkeleton = computed(() => pending.value && !catalogData.value)

// Дополнительные пункты (Акции, Новинки)
const additionalItems = computed(() => catalogData.value?.additional || [])

// Определяем размер карточки
function getCategorySize(category: CategoryRow): 'small' | 'medium' | 'large' {
  const order = (category as any).featured_order ?? 0
  if (order >= 67)
    return 'large'
  if (order >= 34)
    return 'medium'
  return 'small'
}

// 🚀 Оптимизированное получение URL с правильными размерами
function getCategoryImageUrl(category: CategoryRow): string | null {
  if (!category.image_url)
    return null

  const size = getCategorySize(category)

  // Адаптивные размеры под карточку
  const dimensions = size === 'large'
    ? { width: 200, height: 200 }
    : size === 'medium'
      ? { width: 180, height: 180 }
      : { width: 150, height: 150 }

  return getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, {
    ...dimensions,
    quality: 70,
    format: 'webp',
    resize: 'contain',
  })
}

// 🔧 Безопасное получение blur placeholder
function getCategoryBlurUrl(category: CategoryRow): string | null {
  const blur = category.blur_placeholder

  // Возвращаем null если пустая строка или null
  return blur && blur.trim() !== '' ? blur : null
}

// Современные яркие градиенты
const additionalItemStyles = {
  new: {
    gradient: 'bg-gray-50',
    shadow: 'shadow-emerald-500/30',
  },
  sale: {
    gradient: 'bg-gray-50',
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
      <!-- 🎨 Улучшенный скелетон - показываем только если идёт загрузка И данных нет -->
      <div v-if="showSkeleton" class="space-y-2">
        <!-- Блоки Акции и Новинки -->
        <div class="grid grid-cols-2 gap-2">
          <Skeleton class="w-full h-[200px] rounded-3xl" />
          <Skeleton class="w-full h-[200px] rounded-3xl" />
        </div>

        <!-- Сетка категорий -->
        <div class="grid grid-cols-2 gap-2 auto-rows-[120px]">
          <Skeleton class="w-full h-full rounded-2xl row-span-2" />
          <Skeleton class="w-full h-full rounded-2xl row-span-1" />
          <Skeleton class="w-full h-full rounded-2xl row-span-1" />
          <Skeleton class="w-full h-full rounded-2xl row-span-2" />
          <Skeleton class="w-full h-full rounded-2xl row-span-1" />
          <Skeleton class="w-full h-full rounded-2xl row-span-1" />
        </div>
      </div>

      <!-- Контент - рендерится сразу после загрузки -->
      <div v-else class="space-y-2">
        <!-- Блоки Акции и Новинки -->
        <div v-if="additionalItems.length > 0" class="grid grid-cols-2 gap-2">
          <NuxtLink
            v-for="item in additionalItems"
            :key="item.id"
            :to="item.href"
            class="relative block overflow-hidden rounded-3xl h-[200px] hover:shadow-2xl active:scale-[0.97] transition-transform duration-200 group"
            :class="additionalItemStyles[item.id as keyof typeof additionalItemStyles]?.shadow || 'shadow-lg'"
          >
            <div
              class="relative h-full bg-gradient-to-br overflow-hidden"
              :class="additionalItemStyles[item.id as keyof typeof additionalItemStyles]?.gradient || 'from-primary to-primary/80'"
            >
              <!-- Декоративные элементы -->
              <div class="absolute top-0 right-0 w-full h-full">
                <div class="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/20 blur-3xl" />
              </div>
              <div class="absolute bottom-0 left-0 w-full h-full">
                <div class="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
              </div>

              <!-- Эмодзи -->
              <div class="absolute -top-3 -right-3 z-10 transform group-hover:scale-110 transition-transform duration-300">
                <span class="text-9xl drop-shadow-2xl">
                  {{ item.id === 'sale' ? '🏷️' : '⭐' }}
                </span>
              </div>

              <!-- Контент -->
              <div class="absolute left-0 top-1/2 -translate-y-1/2 p-5 z-10 max-w-[55%]">
                <div class="space-y-1">
                  <h3 class="text-xl font-bold leading-tight tracking-tight">
                    {{ item.name }}
                  </h3>
                </div>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Сетка категорий - с оптимизированными изображениями -->
        <div v-if="secondLevelCategories.length > 0" class="grid grid-cols-2 gap-2 auto-rows-[120px]">
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="category-card relative block overflow-hidden rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all duration-200 bg-gray-50"
            :class="[
              getCategorySize(category) === 'large' ? 'row-span-2'
              : getCategorySize(category) === 'medium' ? 'row-span-2'
                : 'row-span-1',
            ]"
            :style="{ '--animation-delay': `${Math.min(index * 30, 300)}ms` }"
          >
            <!-- 🖼️ Изображение через ProgressiveImage с исправленной передачей blur -->
            <div v-if="category.image_url" class="absolute bottom-0 right-0 w-[85%] h-[85%]">
              <ProgressiveImage
                :src="getCategoryImageUrl(category)"
                :alt="category.name"
                :blur-data-url="getCategoryBlurUrl(category)"
                aspect-ratio="square"
                object-fit="contain"
                :placeholder-type="getCategoryBlurUrl(category) ? 'lqip' : 'shimmer'"
                eager
              />
            </div>

            <!-- Фоллбэк без изображения -->
            <div v-else class="absolute bottom-0 right-0 w-[85%] h-[85%] flex items-end justify-center">
              <Icon
                :name="category.icon_name || 'lucide:package'"
                class="w-20 h-20 text-muted-foreground opacity-30"
              />
            </div>

            <!-- Контент карточки - показывается сразу -->
            <div class="absolute top-0 left-0 p-4 max-w-[70%] z-20">
              <h3 class="font-bold leading-tight text-foreground text-sm">
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

<style scoped>
/* Анимация появления карточек */
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

.category-card {
  animation: fadeInUp 0.4s ease-out forwards;
  opacity: 0;
  animation-delay: var(--animation-delay, 0ms);
}
</style>
