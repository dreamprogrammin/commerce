<script setup lang="ts">
import type { BrandFilterState } from '@/composables/useBrandPageFilters'
import type { Brand, IBreadcrumbItem, ProductLine } from '@/types'
import { ArrowLeft, Package, ShieldCheck, SlidersHorizontal } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import BrandLinesGrid from './BrandLinesGrid.vue'

const props = defineProps<{
  brand: Brand
  productLines: ProductLine[]
  featuredProductLines: ProductLine[]
  breadcrumbs: IBreadcrumbItem[]
  filterState: BrandFilterState
}>()

const fs = props.filterState
const { getVariantUrl } = useSupabaseStorage()

const displayH1 = computed(() => props.brand.seo_h1 || props.brand.name)

// Линейки, не входящие в featured
const otherProductLines = computed(() => {
  const featuredIds = new Set(props.featuredProductLines.map(line => line.id))
  return props.productLines.filter(line => !featuredIds.has(line.id))
})
</script>

<template>
  <div class="space-y-6 md:space-y-10">
    <!-- H1 скрыт визуально, но виден поисковикам -->
    <h1 class="sr-only">
      {{ displayH1 }}
    </h1>

    <!-- Breadcrumbs -->
    <Breadcrumbs :items="breadcrumbs" />

    <!-- Hero section -->
    <div class="relative overflow-hidden rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.06),transparent)]" />

      <div class="relative p-5 md:p-10 lg:p-12">
        <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
          <!-- Логотип бренда -->
          <div v-if="brand.logo_url" class="shrink-0">
            <div class="w-20 h-20 md:w-32 md:h-32 rounded-2xl bg-white shadow-md ring-1 ring-border overflow-hidden">
              <ProgressiveImage
                :src="getVariantUrl(BUCKET_NAME_BRANDS, brand.logo_url, 'sm')"
                :alt="`Логотип ${brand.name}`"
                object-fit="contain"
                placeholder-type="shimmer"
                :use-transform="false"
                eager
                class="w-full h-full"
              />
            </div>
          </div>

          <!-- Информация о бренде -->
          <div class="flex-1 text-center md:text-left space-y-3">
            <p class="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
              {{ brand.name }}
            </p>

            <div class="flex flex-wrap gap-2 justify-center md:justify-start">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs md:text-sm font-medium">
                <Package class="w-3.5 h-3.5" />
                {{ fs.products.value.length }} {{ fs.products.value.length === 1 ? 'товар' : fs.products.value.length < 5 ? 'товара' : 'товаров' }}
              </span>
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs md:text-sm font-medium">
                <ShieldCheck class="w-3.5 h-3.5" />
                Оригинал
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Featured Product Lines — Liquid Glass -->
    <div v-if="featuredProductLines.length > 0">
      <h2 class="text-sm font-semibold text-foreground/50 tracking-wide uppercase mb-3">
        Популярные серии
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
        <NuxtLink
          v-for="line in featuredProductLines"
          :key="line.id"
          :to="`/brand/${brand.slug}/${line.slug}`"
          class="featured-glass-card group"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="getVariantUrl('product-line-logos', line.logo_url, 'sm')"
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-out"
            />
            <!-- Name pill -->
            <div class="absolute inset-x-0 bottom-0 px-2.5 py-2">
              <span
                class="inline-block text-white text-xs md:text-sm font-semibold line-clamp-1
                       drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
              >
                {{ line.name }}
              </span>
            </div>
          </template>

          <div
            v-else
            class="w-full h-full bg-linear-to-br from-primary/55 via-primary/35 to-secondary/55
                   flex items-end p-2.5"
          >
            <span class="text-white text-xs md:text-sm font-semibold line-clamp-2 drop-shadow-sm">
              {{ line.name }}
            </span>
          </div>

          <!-- Top highlight on hover -->
          <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </NuxtLink>
      </div>
    </div>

    <!-- Коллекции (другие, не featured) -->
    <BrandLinesGrid
      v-if="otherProductLines.length > 0"
      :lines="otherProductLines"
      :all-lines="productLines"
      :brand-id="brand.id"
      :brand-slug="brand.slug"
    />

    <!-- Catalog header + Filter trigger -->
    <div class="flex flex-row justify-between items-center gap-2">
      <h2 class="text-xl md:text-3xl font-bold">
        Каталог товаров
      </h2>
      <div class="flex items-center gap-2">
        <!-- Mobile filter button -->
        <Button
          variant="outline"
          size="sm"
          class="lg:hidden relative"
          @click="fs.mobileFiltersOpen.value = true"
        >
          <SlidersHorizontal class="w-4 h-4" />
          <span class="sr-only">Фильтры</span>
          <span
            v-if="fs.activeFiltersCount.value > 0"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center"
          >
            {{ fs.activeFiltersCount.value }}
          </span>
        </Button>
        <CatalogHeader v-model:sort-by="fs.sortBy.value" />
      </div>
    </div>

    <!-- Sidebar + Products grid -->
    <div class="flex gap-6">
      <!-- Desktop Sidebar -->
      <aside class="hidden lg:block w-64 shrink-0">
        <BrandFilterSidebar :state="fs" />
      </aside>

      <!-- Products -->
      <main class="flex-1 min-w-0">
        <ProductGridSkeleton v-if="fs.isLoading.value" />

        <ProductGrid v-else-if="fs.products.value.length > 0" :products="fs.products.value" />

        <Card v-else class="border-2 border-dashed">
          <CardContent class="flex flex-col items-center justify-center py-10 md:py-16 text-center px-4">
            <div class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center mb-3 md:mb-4">
              <Package class="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
            </div>
            <h3 class="text-lg md:text-xl font-semibold mb-2">
              Товаров пока нет
            </h3>
            <p class="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 max-w-sm">
              К сожалению, товары бренда {{ brand.name }} временно отсутствуют в продаже.
            </p>
            <NuxtLink to="/catalog/all">
              <Button variant="outline">
                <ArrowLeft class="w-4 h-4 mr-2" />
                Вернуться в каталог
              </Button>
            </NuxtLink>
          </CardContent>
        </Card>
      </main>
    </div>

    <!-- Mobile filter drawer -->
    <BrandFilterMobile :state="fs" />

    <!-- SEO текст -->
    <div v-if="brand.seo_text" class="mt-6 md:mt-12 border-t pt-6 md:pt-10">
      <div class="brand-description text-foreground">
        <div
          class="text-sm md:text-base leading-relaxed"
          v-html="brand.seo_text"
        />
      </div>
    </div>

    <!-- Fallback на обычное описание если нет seo_text -->
    <div v-else-if="brand.description" class="mt-6 md:mt-12 border-t pt-6 md:pt-10">
      <BrandDescription :brand="brand" />
    </div>
  </div>
</template>

<style scoped>
.featured-glass-card {
  position: relative;
  aspect-ratio: 3 / 2;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 4px 16px rgba(31, 38, 135, 0.07),
    0 1px 3px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  transition:
    box-shadow 0.35s ease,
    border-color 0.35s ease,
    transform 0.35s ease;
}

.featured-glass-card:hover {
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow:
    0 12px 32px rgba(31, 38, 135, 0.14),
    0 3px 8px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
  transform: translateY(-3px);
}
</style>
