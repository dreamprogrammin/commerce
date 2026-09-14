<script setup lang="ts">
/**
 * Лента «Смотрят вместе с брендом» — макет `Бренд LEGO v2.dc.html`,
 * секция «Рекомендуем».
 *
 * В макете подпись была «Чаще всего берут вместе с наборами LEGO». Данных о
 * совместных покупках у нас нет: `accessory_ids` у товаров бренда пустой,
 * заказы на клиент не приходят. Поэтому в ленте — товары ТОГО ЖЕ раздела
 * каталога других брендов, и подпись говорит ровно это. Заодно это внутренние
 * ссылки на соседние бренды, которых со страницы бренда не было.
 */
import type { ProductWithGallery } from '@/types'

const props = defineProps<{
  /** Товары того же раздела, но других брендов. Приходят с сервера. */
  products: ProductWithGallery[]
  categoryName?: string | null
}>()

const { railRef, atStart, atEnd, syncEdges, nudge, onMouseDown } = useRailScroll()

const subtitle = computed(() =>
  props.categoryName
    ? `${props.categoryName} других брендов в наличии`
    : 'Похожие товары других брендов',
)

onMounted(() => nextTick(syncEdges))
watch(() => props.products.length, () => nextTick(syncEdges))
</script>

<template>
  <section v-if="products.length > 2" class="blr">
    <div class="blr__inner">
      <div class="blr__head">
        <div class="blr__head-text">
          <h2 class="blr__title">
            Рекомендуем
          </h2>
          <span class="blr__sub">{{ subtitle }}</span>
        </div>
        <span class="blr__arrows">
          <button
            type="button"
            class="blr__arrow"
            :disabled="atStart"
            aria-label="Назад"
            @click="nudge(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-[18px]" />
          </button>
          <button
            type="button"
            class="blr__arrow"
            :disabled="atEnd"
            aria-label="Вперёд"
            @click="nudge(1)"
          >
            <Icon name="lucide:chevron-right" class="size-[18px]" />
          </button>
        </span>
      </div>

      <div
        ref="railRef"
        class="blr__rail"
        @scroll="syncEdges"
        @mousedown="onMouseDown"
      >
        <div v-for="(product, index) in products" :key="product.id" class="blr__item">
          <ProductCard :product="(product as any)" :position="index" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blr {
    padding: 0 0 34px;
    background: var(--background);
  }

  .blr__inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blr__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }

  .blr__head-text {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .blr__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.03em;
  }

  .blr__sub {
    color: var(--muted-foreground);
    font-size: 14.5px;
  }

  .blr__arrows {
    display: none;
    gap: 8px;
  }

  .blr__arrow {
    display: grid;
    place-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    cursor: pointer;
  }

  .blr__arrow:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .blr__rail {
    display: flex;
    gap: 12px;
    align-items: stretch;
    margin-inline: calc(-1 * var(--page-gutter));
    padding: 2px var(--page-gutter) 10px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scroll-padding-inline: var(--page-gutter);
    scrollbar-width: none;
    cursor: grab;
    touch-action: pan-x pan-y;
  }

  .blr__rail::-webkit-scrollbar {
    display: none;
  }

  .blr__item {
    display: flex;
    flex: none;
    width: 216px;
    scroll-snap-align: start;
  }

  @media (min-width: 760px) {
    .blr {
      padding: 0 0 64px;
    }

    .blr__title {
      font-size: 34px;
    }

    .blr__arrows {
      display: inline-flex;
    }

    .blr__rail {
      gap: 16px;
      margin-inline: 0;
      padding: 2px 2px 6px;
      scroll-padding-inline: 0;
    }

    .blr__item {
      width: 256px;
    }
  }
}
</style>
