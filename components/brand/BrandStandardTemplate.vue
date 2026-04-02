<script setup lang="ts">
import type { BrandFilterState } from "@/composables/useBrandPageFilters";
import type { Brand, IBreadcrumbItem, ProductLine } from "@/types";
import {
  ArrowLeft,
  ChevronDown,
  Package,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-vue-next";
import { useSupabaseStorage } from "@/composables/menuItems/useSupabaseStorage";
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT_LINES } from "@/constants";
import { formatRating } from "@/utils/formatRating";

const props = defineProps<{
  brand: Brand;
  productLines?: ProductLine[];
  breadcrumbs: IBreadcrumbItem[];
  filterState: BrandFilterState;
  brandStats?: { average_rating: number; total_reviews_count: number } | null;
}>();

const fs = props.filterState;
const { getVariantUrl } = useSupabaseStorage();

const isSeoExpanded = ref(false);
const seoContentRef = ref<HTMLElement | null>(null);
const seoContentHeight = ref(0);

function toggleSeoExpanded() {
  if (!isSeoExpanded.value && seoContentRef.value) {
    seoContentHeight.value = seoContentRef.value.scrollHeight;
  }
  isSeoExpanded.value = !isSeoExpanded.value;
}
</script>

<template>
  <div class="space-y-4 md:space-y-8">
    <!-- Breadcrumbs -->
    <Breadcrumbs :items="breadcrumbs" />

    <!-- Hero section -->
    <div
      class="relative overflow-hidden rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background"
    >
      <div
        class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(var(--primary)/0.06),transparent)]"
      />

      <div class="relative p-5 md:p-10 lg:p-12">
        <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
          <div v-if="brand.logo_url" class="shrink-0">
            <div
              class="w-20 h-20 md:w-32 md:h-32 rounded-2xl bg-white shadow-md ring-1 ring-border overflow-hidden"
            >
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

          <div class="flex-1 text-center md:text-left space-y-3">
            <h1
              class="text-2xl md:text-4xl lg:text-5xl font-bold tracking-tight text-foreground"
            >
              {{ brand.name }}
            </h1>

            <!-- Brand Trust Score -->
            <div
              v-if="brandStats && brandStats.total_reviews_count > 0"
              class="inline-flex items-center gap-3 bg-white/80 backdrop-blur-sm p-3 md:p-4 rounded-2xl border border-border/50 shadow-sm mt-4 transition-all hover:shadow-md group"
            >
              <div
                class="p-2 bg-yellow-400/10 rounded-xl group-hover:scale-110 transition-transform"
              >
                <Icon name="streamline-stickies-color:star" class="w-8 h-8" />
              </div>

              <div class="flex flex-col justify-center">
                <div class="flex items-center gap-1.5">
                  <span class="text-xl font-black text-foreground">
                    {{ brandStats.average_rating.toFixed(1).replace(".", ",") }}
                  </span>
                  <span
                    class="text-[10px] md:text-xs font-bold text-muted-foreground uppercase tracking-wider"
                  >
                    Рейтинг бренда
                  </span>
                </div>

                <p class="text-[11px] text-muted-foreground">
                  На основе
                  <strong class="text-foreground">{{
                    brandStats.total_reviews_count
                  }}</strong>
                  отзывов покупателей
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 justify-center md:justify-start">
              <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs md:text-sm font-medium"
              >
                <Package class="w-3.5 h-3.5" />
                {{ fs.products.value.length }}
                {{
                  fs.products.value.length === 1
                    ? "товар"
                    : fs.products.value.length < 5
                      ? "товара"
                      : "товаров"
                }}
              </span>
              <span
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-xs md:text-sm font-medium"
              >
                <ShieldCheck class="w-3.5 h-3.5" />
                Оригинал
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Коллекции — карточки с логотипами -->
    <div v-if="productLines && productLines.length > 0">
      <h2
        class="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3"
      >
        Коллекции
      </h2>
      <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5"
      >
        <NuxtLink
          v-for="line in productLines"
          :key="line.id"
          :to="`/brand/${brand.slug}/${line.slug}`"
          class="group relative aspect-[3/2] rounded-xl overflow-hidden border border-border/60 bg-muted/20 hover:border-primary/30 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5"
        >
          <template v-if="line.logo_url">
            <ProgressiveImage
              :src="
                getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'sm')
              "
              :alt="line.name"
              object-fit="cover"
              placeholder-type="shimmer"
              :use-transform="false"
              class="w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
            <div
              class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-2.5 pb-2 pt-8"
            >
              <span
                class="text-white text-xs md:text-sm font-semibold line-clamp-1 drop-shadow-sm"
              >
                {{ line.name }}
              </span>
            </div>
          </template>
          <div
            v-else
            class="w-full h-full bg-gradient-to-br from-primary/50 via-primary/30 to-secondary/50 flex items-end p-2.5"
          >
            <span
              class="text-white text-xs md:text-sm font-semibold line-clamp-2 drop-shadow-sm"
            >
              {{ line.name }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Catalog header + Filter trigger -->
    <div class="flex flex-row justify-between items-center gap-2">
      <h2 class="text-xl md:text-3xl font-bold">Каталог товаров</h2>
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

        <ProductGrid
          v-else-if="fs.products.value.length > 0"
          :products="fs.products.value"
        />

        <Card v-else class="border-2 border-dashed">
          <CardContent
            class="flex flex-col items-center justify-center py-10 md:py-16 text-center px-4"
          >
            <div
              class="w-12 h-12 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center mb-3 md:mb-4"
            >
              <Package class="w-6 h-6 md:w-8 md:h-8 text-muted-foreground" />
            </div>
            <h3 class="text-lg md:text-xl font-semibold mb-2">
              Товаров пока нет
            </h3>
            <p
              class="text-sm md:text-base text-muted-foreground mb-4 md:mb-6 max-w-sm"
            >
              К сожалению, товары бренда {{ brand.name }} временно отсутствуют в
              продаже.
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

    <!-- Отзывы о бренде -->
    <div class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
      <BrandReviewsList :brand-id="brand.id" :brand-name="brand.name" />
    </div>

    <!-- Описание бренда -->
    <div v-if="brand.description" class="mt-6 md:mt-12 border-t pt-4 md:pt-8">
      <div class="space-y-3 md:space-y-4">
        <button
          class="flex items-center gap-2 text-left w-full group"
          @click="toggleSeoExpanded"
        >
          <h3
            class="text-base md:text-lg font-semibold text-muted-foreground group-hover:text-foreground transition-colors"
          >
            О бренде {{ brand.name }}
          </h3>
          <ChevronDown
            class="w-4 h-4 md:w-5 md:h-5 text-muted-foreground transition-transform duration-300"
            :class="{ 'rotate-180': isSeoExpanded }"
          />
        </button>

        <div
          ref="seoContentRef"
          class="overflow-hidden transition-all duration-300 ease-in-out"
          :style="{
            maxHeight: isSeoExpanded ? `${seoContentHeight}px` : undefined,
          }"
          :class="
            isSeoExpanded ? 'opacity-100' : 'max-h-20 md:max-h-24 opacity-70'
          "
        >
          <BrandDescription :brand="brand" />

          <div
            v-if="brand.seo_keywords?.length"
            class="flex flex-wrap gap-1.5 md:gap-2 mt-3 md:mt-4"
          >
            <Badge
              v-for="keyword in brand.seo_keywords"
              :key="keyword"
              variant="secondary"
              class="text-[10px] md:text-xs"
            >
              {{ keyword }}
            </Badge>
          </div>
        </div>

        <button
          v-if="brand.description && brand.description.length > 150"
          class="text-xs md:text-sm text-primary hover:underline"
          @click="toggleSeoExpanded"
        >
          {{ isSeoExpanded ? "Свернуть" : "Читать далее" }}
        </button>
      </div>
    </div>
  </div>
</template>
