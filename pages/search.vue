<script setup lang="ts">
/**
 * Страница результатов поиска.
 *
 * ЗДЕСЬ БЫЛА ЗАГЛУШКА: поле ввода и пять захардкоженных подсказок
 * («Подгузники-трусики», «Футболка для мальчика» — товаров таких в магазине
 * нет вовсе), а по вводу страница уводила на `/catalog/all?q=…`. Каталог
 * параметр `q` не читает — проверено на проде 4 сентября 2026: `?q=lego`
 * отдавал ровно тот же список, что и без запроса. То есть найти товар поиском
 * было нельзя в принципе: шторка показывала подсказки, а «Показать все»
 * приводило в общий каталог.
 *
 * Теперь страница честно показывает найденное — теми же функциями базы, что и
 * шторка. Её адрес обещан поисковикам в schema.org (`app.vue`), поэтому он и
 * стал местом результатов.
 */
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

definePageMeta({
  layout: 'blank',
})

const route = useRoute()
const router = useRouter()

const {
  searchQuery,
  searchResults,
  isSearching,
  brandSuggestions,
  hasResults,
  searchProducts,
  debouncedSearch,
} = useProductSearch()

const { getVariantUrl } = useSupabaseStorage()

const queryFromUrl = computed(() => String(route.query.q ?? '').trim())

useHead(() => ({
  title: queryFromUrl.value
    ? `${queryFromUrl.value} — поиск товаров`
    : 'Поиск товаров',
  // Страницы результатов в индексе не нужны: их бесконечно много, а ценности
  // для поисковика в них нет.
  meta: [{ name: 'robots', content: 'noindex, follow' }],
}))

/*
 * Запрос приходит из адреса — так работают и переход из шторки, и ссылка,
 * присланная другу, и возврат кнопкой «назад».
 */
watch(queryFromUrl, (value) => {
  searchQuery.value = value
  if (value)
    searchProducts(value)
  else
    searchResults.value = []
}, { immediate: true })

/** Ввод прямо на странице: адрес обновляем, чтобы ссылка оставалась рабочей. */
function onInput() {
  const value = searchQuery.value.trim()
  debouncedSearch(value)
  router.replace(value ? { query: { q: value } } : { query: {} })
}

function goBack() {
  router.back()
}

function formatPrice(price: number, discount?: number) {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  const final = hasDiscount
    ? (price * (1 - discount / 100)).toLocaleString('ru-RU')
    : original

  return { original, final, hasDiscount }
}

/*
 * Вариант `sm`, а НЕ трансформация на лету.
 *
 * `getImageUrl(bucket, path, {width…})` на этом проекте картинку не отдаёт:
 * трансформация у Supabase платная, хранилище отвечает `403 FeatureNotEnabled`,
 * и функция молча возвращает публичный URL БЕЗ суффикса — а файлы лежат как
 * `<имя>_sm.webp`. Браузер получает не картинку и режет ответ
 * (`ERR_BLOCKED_BY_ORB`), в карточке остаётся «Не загрузилось». Ровно это и
 * было видно на боевом сайте 4 сентября 2026. `getVariantUrl` подставляет
 * суффикс — так делают карточка товара и корзина.
 */
function productImage(imageUrl: string | null): string | null {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-gray-900">
    <header class="sticky top-0 z-10 flex-shrink-0 flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Button
        variant="ghost"
        size="icon"
        class="rounded-full h-10 w-10 shrink-0"
        aria-label="Вернуться назад"
        @click="goBack"
      >
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </Button>

      <div class="relative w-full">
        <Input
          v-model="searchQuery"
          type="search"
          placeholder="Поиск по товарам"
          aria-label="Поиск по товарам"
          class="h-10 rounded-lg text-base border-2 focus:border-primary"
          @input="onInput"
        />
      </div>
    </header>

    <main class="flex-1 w-full max-w-3xl mx-auto p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
      <!-- Бренды: «лего» приводит и к самому бренду, не только к товарам -->
      <div v-if="brandSuggestions.length" class="mb-4 flex flex-wrap gap-2">
        <NuxtLink
          v-for="brand in brandSuggestions"
          :key="brand.id"
          :to="`/brand/${brand.slug}`"
          class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
        >
          <Icon name="lucide:tag" class="size-4" />
          {{ brand.name }}
        </NuxtLink>
      </div>

      <p v-if="isSearching" class="py-10 text-center text-sm text-muted-foreground">
        Ищем…
      </p>

      <template v-else-if="hasResults">
        <h1 class="px-1 mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Найдено · {{ searchResults.length }}
        </h1>

        <NuxtLink
          v-for="product in searchResults"
          :key="product.id"
          :to="`/catalog/products/${product.slug}`"
          class="w-full flex items-center gap-3 px-2 py-3 border-b border-border/60 last:border-0 active:bg-muted/60 transition-colors"
        >
          <div class="size-[72px] rounded-lg overflow-hidden shrink-0 bg-muted">
            <ProgressiveImage
              v-if="product.product_images[0]?.image_url"
              :src="productImage(product.product_images[0].image_url)"
              :src-sm="productImage(product.product_images[0].image_url)"
              sizes="72px"
              :alt="product.name"
              aspect-ratio="square"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="product.product_images[0].blur_placeholder"
              eager
            />
            <div v-else class="w-full h-full flex items-center justify-center bg-muted">
              <Icon name="lucide:package" class="size-6 text-muted-foreground/60" />
            </div>
          </div>

          <div class="flex-1 min-w-0">
            <h2 class="text-sm font-medium text-foreground line-clamp-2 mb-1 leading-snug">
              {{ product.name }}
            </h2>

            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                class="text-base font-bold"
                :class="formatPrice(product.price, product.discount_percentage).hasDiscount ? 'text-destructive' : 'text-foreground'"
              >
                {{ formatPrice(product.price, product.discount_percentage).final }}&nbsp;₸
              </span>
              <span
                v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                class="text-xs text-muted-foreground line-through"
              >
                {{ formatPrice(product.price, product.discount_percentage).original }}&nbsp;₸
              </span>
            </div>

            <p v-if="product.brands" class="text-xs text-muted-foreground mt-0.5">
              {{ product.brands.name }}
            </p>
          </div>

          <Icon name="lucide:chevron-right" class="size-5 text-muted-foreground shrink-0" />
        </NuxtLink>
      </template>

      <div v-else-if="queryFromUrl" class="py-16 text-center">
        <Icon name="lucide:search-x" class="mx-auto size-12 text-muted-foreground/60" />
        <p class="mt-4 text-lg font-semibold">
          Ничего не найдено
        </p>
        <p class="mt-1 text-sm text-muted-foreground">
          По запросу «{{ queryFromUrl }}» товаров нет. Попробуйте другое слово.
        </p>
        <NuxtLink
          to="/catalog/all"
          class="mt-5 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
        >
          Открыть весь каталог
        </NuxtLink>
      </div>

      <p v-else class="py-16 text-center text-sm text-muted-foreground">
        Введите название игрушки, бренда или набора.
      </p>
    </main>
  </div>
</template>
