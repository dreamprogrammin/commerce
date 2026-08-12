<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

definePageMeta({
  layout: 'profile',
  profileBare: true, // страница рисует собственные карточки, обёртка layout не нужна
})

useHead({ title: 'Избранное' })

const wishlistStore = useWishlistStore()
const { wishlistProducts: products, isLoading } = storeToRefs(wishlistStore)

/*
 * Доступ к странице закрывает `middleware/auth.global.ts`: неавторизованного
 * сюда не пустят, поэтому собственной проверки с редиректом здесь нет.
 */
await useAsyncData('user-wishlist-page', async () => {
  await wishlistStore.fetchWishlistProducts()
  // Данные живут в сторе, возвращать нечего
  return true
})

const count = computed(() => products.value.length)
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1
        class="inline-flex items-center gap-[11px] text-[clamp(24px,2.8vw,30px)] font-extrabold tracking-[-0.025em]"
      >
        Избранное
        <span class="rounded-full bg-blue-50 px-3 py-1 text-[15px] font-extrabold text-primary">
          {{ count }}
        </span>
      </h1>
      <span v-if="count > 0" class="text-sm font-medium text-muted-foreground">
        Товары, которые вам понравились
      </span>
    </div>

    <!-- ⏳ Загрузка: скелетоны в той же сетке, чтобы не прыгала высота -->
    <div v-if="isLoading" class="wl-grid grid gap-3 md:gap-4">
      <div
        v-for="n in 6"
        :key="`skeleton-${n}`"
        class="h-[336px] animate-pulse rounded-[20px] border border-border bg-white/70"
      />
    </div>

    <!-- 💙 Список товаров -->
    <div v-else-if="count > 0" class="wl-grid grid gap-3 md:gap-4">
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
      />
    </div>

    <!-- 🫙 Пусто -->
    <div
      v-else
      class="rounded-[22px] border border-border bg-white px-6 py-14 text-center shadow-sm"
    >
      <span
        class="mb-4 inline-grid size-[72px] place-content-center rounded-full bg-blue-50 text-primary"
      >
        <Icon name="line-md:heart" class="size-[34px]" />
      </span>
      <p class="mb-1.5 text-[19px] font-extrabold text-foreground">
        В избранном пока пусто
      </p>
      <p class="mb-5 text-sm font-medium text-muted-foreground">
        Добавляйте игрушки, чтобы вернуться к ним позже
      </p>
      <NuxtLink
        to="/catalog"
        class="inline-flex h-[46px] items-center gap-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 px-[22px] text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(43,127,255,0.3)]"
      >
        <Icon name="lucide:shopping-bag" class="size-[18px]" />
        В каталог
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  /* Сетка из макета: две колонки на мобильном, дальше — автозаполнение
     колонками не уже 212px (карточка каталога рассчитана на эту ширину). */
  .wl-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (width >= 768px) {
    .wl-grid {
      grid-template-columns: repeat(auto-fill, minmax(212px, 1fr));
    }
  }
}
</style>
