<script setup lang="ts">
import type { Database } from '@/types'
import { carouselContainerVariants } from '@/lib/variants'

definePageMeta({ layout: 'catalog' })

const supabase = useSupabaseClient<Database>()
const containerClass = carouselContainerVariants({ contained: 'always' })

// SEO
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const pageUrl = `${siteUrl}/catalog/promotions`

const metaTitle = 'Акции и скидки на детские игрушки | Ухтышка'
const metaDescription = 'Акции и специальные предложения на детские игрушки в Ухтышка ⭐ Скидки до 50% на популярные товары ✓ Доставка по Казахстану ✓ Бонусная программа'

// Загрузка товаров на акции
const { data: products, pending } = await useAsyncData(
  'promotion-products',
  async () => {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_images (
          id,
          image_url,
          display_order,
          blur_placeholder
        ),
        categories (
          id,
          name,
          slug
        )
      `)
      .eq('is_on_promotion', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Ошибка загрузки акций:', error)
      return []
    }

    return data || []
  },
  {
    lazy: true,
    server: true,
  },
)

// SEO мета-теги
useHead({
  title: metaTitle,
  link: [
    { rel: 'canonical', href: pageUrl },
  ],
  meta: [
    { name: 'description', content: metaDescription },
    { name: 'keywords', content: 'акции игрушек, скидки на игрушки, детские товары со скидкой, распродажа' },

    // Open Graph
    { property: 'og:title', content: metaTitle },
    { property: 'og:description', content: metaDescription },
    { property: 'og:url', content: pageUrl },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: siteName },

    // Twitter Card
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: metaTitle },
    { name: 'twitter:description', content: metaDescription },

    // Robots
    { name: 'robots', content: 'index, follow' },
  ],
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div :class="containerClass" class="py-8">
      <!-- Заголовок -->
      <div class="mb-8">
        <div class="flex items-center gap-3 mb-2">
          <Icon name="lucide:badge-percent" class="w-8 h-8 text-red-500" />
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
            Акции
          </h1>
        </div>
        <p class="text-gray-600 dark:text-gray-400">
          Специальные предложения и скидки на игрушки
        </p>
      </div>

      <!-- Скелетон загрузки -->
      <div v-if="pending" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <Skeleton v-for="i in 10" :key="i" class="h-[350px] rounded-xl" />
      </div>

      <!-- Список товаров -->
      <div v-else-if="products && products.length > 0" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <ProductCard
          v-for="product in products"
          :key="product.id"
          :product="product"
        />
      </div>

      <!-- Пустое состояние -->
      <Card v-else class="flex flex-col items-center justify-center py-16 text-center">
        <Icon name="lucide:tag-off" class="w-16 h-16 text-muted-foreground mb-4" />
        <CardTitle class="mb-2">
          Сейчас нет активных акций
        </CardTitle>
        <CardDescription>
          Следите за обновлениями - скоро появятся новые специальные предложения!
        </CardDescription>
        <Button as-child class="mt-4" variant="outline">
          <NuxtLink to="/catalog">
            Перейти в каталог
          </NuxtLink>
        </Button>
      </Card>
    </div>
  </div>
</template>
