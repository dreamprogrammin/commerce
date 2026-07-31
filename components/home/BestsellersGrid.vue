<script setup lang="ts">
import type { ProductWithGallery } from '@/types'
import { sectionSpacingVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

/**
 * «Хиты продаж» — сетка товаров + «Показать ещё» (Homepage.dc.html: hits grid).
 *
 * Сама пагинирует через productsStore.fetchProducts(sortBy:'popularity');
 * hasMore из ответа управляет видимостью кнопки. Сетка своя (не глобальный
 * ProductGrid — его нельзя менять, 5+ потребителей), т.к. здесь карточки
 * мельче: 5 колонок на десктопе вместо стандартных 4.
 */
const PAGE_SIZE = 8

const productsStore = useProductsStore()

const products = ref<ProductWithGallery[]>([])
const page = ref(0)
const hasMore = ref(true)
const isLoading = ref(false)

async function loadMore() {
  if (isLoading.value || !hasMore.value)
    return
  isLoading.value = true
  try {
    const next = page.value + 1
    const res = await productsStore.fetchProducts(
      { categorySlug: 'all', sortBy: 'popularity' },
      next,
      PAGE_SIZE,
    )
    products.value.push(...res.products)
    hasMore.value = res.hasMore
    page.value = next
  }
  catch (error) {
    console.error('❌ Не удалось загрузить хиты продаж:', error)
    hasMore.value = false
  }
  finally {
    isLoading.value = false
  }
}

const showSkeleton = computed(() => isLoading.value && products.value.length === 0)
const countLabel = computed(() =>
  products.value.length ? `${products.value.length}+ товаров` : '',
)

onMounted(loadMore)
</script>

<template>
  <section :class="sectionSpacingVariants({ size: 'xs' })">
    <div class="flex items-baseline gap-3 mb-5">
      <h2 class="m-0 font-bold tracking-tight text-[clamp(22px,3vw,32px)]">
        Хиты продаж
      </h2>
      <span v-if="countLabel" class="text-sm text-muted-foreground font-medium">{{ countLabel }}</span>
    </div>

    <div v-if="showSkeleton" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <div
        v-for="i in PAGE_SIZE"
        :key="i"
        class="aspect-[3/4] rounded-xl bg-muted animate-pulse"
      />
    </div>

    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <ProductCard
          v-for="product in products"
          :key="product.id"
          :product="product"
        />
      </div>

      <div v-if="hasMore" class="flex justify-center mt-6">
        <Button
          variant="outline"
          size="lg"
          :disabled="isLoading"
          class="min-w-[220px]"
          @click="loadMore"
        >
          <Icon v-if="isLoading" name="lucide:loader-2" class="size-4 animate-spin" />
          {{ isLoading ? 'Загружаем…' : 'Показать ещё' }}
        </Button>
      </div>
    </template>
  </section>
</template>
