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
const { getVariantUrl } = useSupabaseStorage()

// Оптимизированный useAsyncData: неблокирующий + SSR + кеширование
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
    lazy: true,
    server: true,
    dedupe: 'defer',
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

// SEO - Динамические мета-теги + structured data с категориями
useHead(() => {
  const schemas = [
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
            ? getVariantUrl(BUCKET_NAME_CATEGORY, category.image_url, 'md')
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
      { property: 'og:title', content: metaTitle },
      { property: 'og:description', content: metaDescription },
      { property: 'og:url', content: catalogUrl },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: siteName },
      { property: 'og:locale', content: 'ru_RU' },
      { property: 'og:image', content: `${siteUrl}/og-catalog.jpeg` },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: metaTitle },
      { name: 'twitter:description', content: metaDescription },
      { name: 'twitter:image', content: `${siteUrl}/og-catalog.jpeg` },
      { name: 'robots', content: 'index, follow' },
    ],
    script: schemas,
  }
})

useRobotsRule({
  index: true,
  follow: true,
})

const showSkeleton = computed(() => pending.value && !catalogData.value)
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

// Оптимизированное получение URL с правильными размерами
function getCategoryImageUrl(category: CategoryRow): string | null {
  if (!category.image_url)
    return null
  const size = getCategorySize(category)
  const variant = size === 'large' ? 'md' as const : 'sm' as const
  return getVariantUrl(BUCKET_NAME_CATEGORY, category.image_url, variant)
}

// Безопасное получение blur placeholder
function getCategoryBlurUrl(category: CategoryRow): string | null {
  const blur = category.blur_placeholder
  return blur && blur.trim() !== '' ? blur : null
}

// Палитра пастельных фонов для категорий
const pastelColors = [
  'bg-rose-50',
  'bg-sky-50',
  'bg-amber-50',
  'bg-emerald-50',
  'bg-violet-50',
  'bg-orange-50',
  'bg-teal-50',
  'bg-pink-50',
  'bg-indigo-50',
  'bg-lime-50',
  'bg-cyan-50',
  'bg-fuchsia-50',
]

function getCategoryColor(index: number): string {
  return pastelColors[index % pastelColors.length]
}
</script>

<template>
  <div class="min-h-screen bg-background pb-20">
    <!-- Шапка -->
    <div class="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b sr-only">
      <div class="px-4 py-3">
        <h1 class="text-2xl font-bold">
          Каталог
        </h1>
      </div>
    </div>

    <!-- Основной контент -->
    <div class="px-3 py-4 md:px-6 lg:px-8 max-w-6xl mx-auto">
      <!-- Скелетон -->
      <div v-if="showSkeleton" class="space-y-3">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Skeleton class="w-full aspect-square rounded-2xl row-span-2" />
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
          <Skeleton class="w-full aspect-[4/3] rounded-2xl" />
        </div>
      </div>

      <!-- Контент -->
      <div v-else class="space-y-3">
        <!-- Акции и Новинки -->
        <div v-if="additionalItems.length > 0" class="grid grid-cols-2 gap-3">
          <NuxtLink
            v-for="item in additionalItems"
            :key="item.id"
            :to="item.href"
            class="promo-card relative block overflow-hidden rounded-2xl active:scale-[0.97] transition-transform duration-200 group"
            :class="item.id === 'sale'
              ? 'bg-gradient-to-br from-amber-400 via-orange-400 to-red-400'
              : 'bg-gradient-to-br from-blue-400 via-indigo-400 to-violet-400'"
          >
            <div class="relative aspect-[4/3] flex flex-col justify-between p-4">
              <!-- Декор -->
              <div class="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/15 blur-xl" />
              <div class="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/10 blur-lg" />

              <!-- Иконка -->
              <div class="relative z-10">
                <span class="text-5xl md:text-6xl drop-shadow-lg">
                  {{ item.id === 'sale' ? '🏷️' : '✨' }}
                </span>
              </div>

              <!-- Текст -->
              <div class="relative z-10">
                <h3 class="text-lg md:text-xl font-bold text-white leading-tight drop-shadow-md">
                  {{ item.name }}
                </h3>
                <p class="text-xs md:text-sm text-white/80 mt-0.5">
                  {{ item.id === 'sale' ? 'Скидки до 50%' : 'Новые поступления' }}
                </p>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Сетка категорий -->
        <div
          v-if="secondLevelCategories.length > 0"
          class="catalog-grid"
        >
          <NuxtLink
            v-for="(category, index) in secondLevelCategories"
            :key="category.id"
            :to="category.href"
            class="category-card relative block overflow-hidden rounded-2xl active:scale-[0.97] transition-all duration-200 group"
            :class="[
              getCategoryColor(index),
              getCategorySize(category) === 'large' ? 'catalog-card-large'
              : getCategorySize(category) === 'medium' ? 'catalog-card-medium'
                : 'catalog-card-small',
            ]"
            :style="{ '--animation-delay': `${Math.min(index * 40, 400)}ms` }"
          >
            <!-- Изображение -->
            <div
              v-if="category.image_url"
              class="absolute bottom-0 right-0 w-[70%] h-[80%] flex items-end justify-end"
            >
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

            <!-- Фоллбэк -->
            <div v-else class="absolute bottom-0 right-0 w-[70%] h-[70%] flex items-end justify-center opacity-20">
              <Icon
                :name="category.icon_name || 'lucide:package'"
                class="w-20 h-20 text-muted-foreground"
              />
            </div>

            <!-- Название -->
            <div class="absolute top-0 left-0 p-3 md:p-4 max-w-[65%] z-10">
              <h3 class="font-bold text-foreground leading-snug text-sm md:text-base">
                {{ category.name }}
              </h3>
            </div>

            <!-- Стрелка при наведении (десктоп) -->
            <div class="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm items-center justify-center shadow-sm hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="lucide:arrow-right" class="w-4 h-4 text-foreground" />
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
/* Анимация появления */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
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

.promo-card {
  animation: fadeInUp 0.4s ease-out forwards;
}

/* ==========================================
   Сетка каталога — mobile: 2 колонки, desktop: 3 колонки
   Masonry-подобная сетка с row-span для больших карточек
   ========================================== */
.catalog-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: minmax(130px, auto);
  gap: 0.75rem;
}

/* Маленькая карточка: 1 ряд */
.catalog-card-small {
  grid-row: span 1;
  min-height: 130px;
}

/* Средняя карточка: 2 ряда */
.catalog-card-medium {
  grid-row: span 2;
  min-height: 268px;
}

/* Большая карточка: 2 ряда */
.catalog-card-large {
  grid-row: span 2;
  min-height: 268px;
}

/* Desktop: 3 колонки с увеличенными высотами */
@media (min-width: 768px) {
  .catalog-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: minmax(160px, auto);
    gap: 1rem;
  }

  .catalog-card-small {
    min-height: 160px;
  }

  .catalog-card-medium {
    grid-row: span 2;
    min-height: 330px;
  }

  .catalog-card-large {
    grid-row: span 2;
    min-height: 330px;
  }
}
</style>
