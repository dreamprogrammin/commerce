<script setup lang="ts">
/**
 * Страница результатов поиска.
 *
 * ЗАЧЕМ ОНА ТАКАЯ. Сначала здесь была заглушка с выдуманными подсказками, потом
 * — список в одну колонку. Владелец на список посмотрел и сказал прямо:
 * «просто показывать гигантский результат поиска на десктопе — выглядит не
 * очень; при нажатии Enter нужно просто показать страницу как каталог».
 * Поэтому выдача рисуется той же сеткой карточек, что и каталог
 * (`ProductGrid` → `ProductCard`), в обычном макете сайта — с шапкой, а не в
 * «голом» blank.
 *
 * Живой поиск остаётся в выпадашке шапки и в мобильной шторке; сюда приходят
 * за полным списком — по Enter или по «Показать все».
 */
import type { BaseProduct } from '@/types'

const route = useRoute()

const {
  searchQuery,
  searchResults,
  isSearching,
  brandSuggestions,
  searchProducts,
} = useProductSearch()

const queryFromUrl = computed(() => String(route.query.q ?? '').trim())

/** Выдача в том виде, в каком её ждёт карточка каталога. */
const products = computed<BaseProduct[]>(() => searchResults.value as unknown as BaseProduct[])

useHead(() => ({
  title: queryFromUrl.value
    ? `${queryFromUrl.value} — поиск товаров`
    : 'Поиск товаров',
  // Страницы результатов в индексе не нужны: их бесконечно много, а ценности
  // для поисковика в них нет.
  meta: [{ name: 'robots', content: 'noindex, follow' }],
}))

/*
 * Запрос приходит из адреса — так работают и переход из шапки, и ссылка,
 * присланная другу, и возврат кнопкой «назад».
 */
watch(queryFromUrl, (value) => {
  searchQuery.value = value
  if (value)
    searchProducts(value)
  else
    searchResults.value = []
}, { immediate: true })

/*
 * Своего поля ввода на странице НЕТ намеренно. На десктопе строка поиска стоит
 * в шапке, на телефоне — кнопка «Поиск» рядом с «Каталогом»; собственное поле
 * оказывалось вторым поисковиком на том же экране, прямо под заголовком
 * «Поиск: «лего»». Ровно за такие дубли страница и выглядела кривой.
 */

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return few
  return many
}
</script>

<template>
  <div class="container mx-auto px-3 py-4 lg:py-6">
    <header class="mb-4">
      <h1 class="text-xl lg:text-2xl font-bold">
        <template v-if="queryFromUrl">
          Поиск: «{{ queryFromUrl }}»
        </template>
        <template v-else>
          Поиск по каталогу
        </template>
      </h1>
      <p v-if="queryFromUrl && !isSearching" class="mt-1 text-sm text-muted-foreground">
        {{ products.length }} {{ plural(products.length, 'товар', 'товара', 'товаров') }}
      </p>
    </header>

    <!-- Бренды: «лего» приводит и к самому бренду, не только к товарам -->
    <div v-if="brandSuggestions.length" class="mb-5 flex flex-wrap gap-2">
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

    <ProductGridSkeleton v-if="isSearching" />

    <ProductGrid v-else-if="products.length" :products="products" />

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
  </div>
</template>
