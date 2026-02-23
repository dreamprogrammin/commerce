<script setup lang="ts">
import type { Database } from '@/types'
import { carouselContainerVariants } from '@/lib/variants'

definePageMeta({ layout: 'catalog' })

const supabase = useSupabaseClient<Database>()
const route = useRoute()
const containerClass = carouselContainerVariants({ contained: 'always' })

const slug = computed(() => route.params.slug as string)

// Загрузка кампании + товаров
const { data: pageData, pending } = await useAsyncData(
  `promo-${slug.value}`,
  async () => {
    // 1. Загружаем кампанию
    const { data: campaign, error: campaignError } = await supabase
      .from('promo_campaigns')
      .select('*')
      .eq('slug', slug.value)
      .eq('is_active', true)
      .single()

    if (campaignError || !campaign)
      return null

    // 2. Загружаем товары кампании
    const { data: campaignProducts, error: productsError } = await supabase
      .from('promo_campaign_products')
      .select('product_id')
      .eq('campaign_id', campaign.id)

    if (productsError || !campaignProducts?.length) {
      return { campaign, products: [] }
    }

    const productIds = campaignProducts.map(cp => cp.product_id)

    const { data: products, error: prodError } = await supabase
      .from('products')
      .select(`
        *,
        product_images (
          id,
          image_url,
          display_order,
          blur_placeholder
        ),
        brands (
          id,
          name,
          slug
        )
      `)
      .in('id', productIds)
      .eq('is_active', true)
      .order('name')

    if (prodError) {
      console.error('Error loading promo products:', prodError)
      return { campaign, products: [] }
    }

    return { campaign, products: products || [] }
  },
  {
    lazy: true,
    server: true,
  },
)

const campaign = computed(() => pageData.value?.campaign)
const products = computed(() => pageData.value?.products || [])

// 404 если не нашли
if (!pending.value && !pageData.value?.campaign) {
  throw createError({ statusCode: 404, message: 'Акция не найдена' })
}

// SEO
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const pageUrl = computed(() => `${siteUrl}/promo/${slug.value}`)

const metaTitle = computed(() =>
  campaign.value ? `${campaign.value.title} | ${siteName}` : `Акция | ${siteName}`,
)
const metaDescription = computed(() =>
  campaign.value?.description || `Специальная акция в ${siteName} — скидки на детские игрушки`,
)

useHead({
  title: metaTitle,
  link: [
    { rel: 'canonical', href: pageUrl.value },
  ],
  meta: [
    { name: 'description', content: metaDescription },
    { property: 'og:title', content: metaTitle },
    { property: 'og:description', content: metaDescription },
    { property: 'og:url', content: pageUrl.value },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: siteName },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: metaTitle },
    { name: 'twitter:description', content: metaDescription },
    { name: 'robots', content: 'index, follow' },
  ],
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <div :class="containerClass" class="py-8">
      <!-- Загрузка -->
      <div v-if="pending" class="space-y-6">
        <Skeleton class="h-10 w-80" />
        <Skeleton class="h-5 w-full max-w-lg" />
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <Skeleton v-for="i in 10" :key="i" class="h-[350px] rounded-xl" />
        </div>
      </div>

      <!-- Контент -->
      <template v-else-if="campaign">
        <!-- Заголовок -->
        <div class="mb-8">
          <div class="flex items-center gap-3 mb-2">
            <Icon name="lucide:flame" class="w-8 h-8 text-red-500" />
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ campaign.title }}
            </h1>
            <Badge variant="destructive" class="text-sm">
              -{{ campaign.discount_percentage }}%
            </Badge>
          </div>
          <p v-if="campaign.description" class="text-gray-600 dark:text-gray-400 mt-2">
            {{ campaign.description }}
          </p>
        </div>

        <!-- Товары -->
        <div
          v-if="products.length > 0"
          class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
        >
          <ProductCard
            v-for="product in products"
            :key="product.id"
            :product="product"
          />
        </div>

        <!-- Пусто -->
        <Card v-else class="flex flex-col items-center justify-center py-16 text-center">
          <Icon name="lucide:package-x" class="w-16 h-16 text-muted-foreground mb-4" />
          <CardTitle class="mb-2">
            Товары не найдены
          </CardTitle>
          <Button as-child class="mt-4" variant="outline">
            <NuxtLink to="/catalog">
              Перейти в каталог
            </NuxtLink>
          </Button>
        </Card>
      </template>

      <!-- 404 -->
      <Card v-else class="flex flex-col items-center justify-center py-16 text-center">
        <Icon name="lucide:search-x" class="w-16 h-16 text-muted-foreground mb-4" />
        <CardTitle class="mb-2">
          Акция не найдена
        </CardTitle>
        <CardDescription>
          Акция могла быть завершена или удалена.
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
