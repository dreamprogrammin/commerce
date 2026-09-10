<script setup lang="ts">
/**
 * «Коллекции» — макет `Бренд LEGO.dc.html`, секция после шапки.
 *
 * Лента плиток с обложкой серии и счётчиком наборов; нажатие переключает
 * подборку ниже на эту серию. Кнопка «Все N» открывает шторку со всеми
 * коллекциями и поиском — там плитки уже ссылки на страницы серий.
 */
import type { Brand, ProductLine } from '@/types'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  brand: Brand
  lines: ProductLine[]
  /** Сколько товаров бренда лежит в каждой коллекции. */
  lineCounts: Record<string, number>
  /** Серия, выбранная в подборке ниже: плитка подсвечивается той же. */
  activeLineId?: string | null
  drawerOpen: boolean
}>()

const emit = defineEmits<{
  'pickLine': [lineId: string]
  'update:drawerOpen': [open: boolean]
}>()

const { getVariantUrl } = useSupabaseStorage()
const { railRef, atStart, atEnd, syncEdges, nudge, onMouseDown } = useRailScroll()

const query = ref('')

const collections = computed(() =>
  props.lines.map((line) => {
    const count = props.lineCounts[line.id] ?? 0
    return {
      id: line.id,
      name: line.name,
      href: `/brand/${props.brand.slug}/${line.slug}`,
      cover: line.logo_url
        ? getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'sm')
        : null,
      countLabel: count
        ? `${count} ${pluralRu(count, 'набор', 'набора', 'наборов')}`
        : 'Скоро в наличии',
      isEmpty: count === 0,
    }
  }),
)

const allLabel = computed(() => `Все ${props.lines.length}`)

const found = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle)
    return collections.value
  return collections.value.filter(c => c.name.toLowerCase().includes(needle))
})

const drawer = computed({
  get: () => props.drawerOpen,
  set: (open: boolean) => emit('update:drawerOpen', open),
})

// Плитки приезжают вместе с обложками — края считаем после отрисовки.
onMounted(() => nextTick(syncEdges))
watch(() => props.lines.length, () => nextTick(syncEdges))
watch(drawer, (open) => {
  if (open)
    query.value = ''
})
</script>

<template>
  <section v-if="collections.length" class="blc">
    <div class="blc__head">
      <h2 class="blc__title">
        Коллекции
      </h2>

      <span class="blc__tools">
        <span class="blc__arrows">
          <button
            type="button"
            class="blc__arrow"
            :disabled="atStart"
            aria-label="Предыдущие коллекции"
            @click="nudge(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-[18px]" />
          </button>
          <button
            type="button"
            class="blc__arrow"
            :disabled="atEnd"
            aria-label="Следующие коллекции"
            @click="nudge(1)"
          >
            <Icon name="lucide:chevron-right" class="size-[18px]" />
          </button>
        </span>

        <button type="button" class="blc__all" @click="drawer = true">
          <Icon name="lucide:layout-grid" class="size-[15px]" />
          {{ allLabel }}
        </button>
      </span>
    </div>

    <div
      ref="railRef"
      class="blc__rail"
      @scroll="syncEdges"
      @mousedown="onMouseDown"
    >
      <button
        v-for="collection in collections"
        :key="collection.id"
        type="button"
        class="blc__tile"
        :class="{ 'blc__tile--on': collection.id === activeLineId }"
        @click="emit('pickLine', collection.id)"
      >
        <span
          class="blc__cover"
          :style="collection.cover ? { backgroundImage: `url(${collection.cover})` } : undefined"
        />
        <span class="blc__text">
          <span class="blc__name">{{ collection.name }}</span>
          <span
            class="blc__count"
            :class="{ 'blc__count--empty': collection.isEmpty }"
          >{{ collection.countLabel }}</span>
        </span>
      </button>
    </div>

    <!-- Шторка «Все коллекции»: тот же список, но ссылками на страницы серий. -->
    <Drawer v-model:open="drawer">
      <DrawerContent class="mx-auto max-w-[520px] px-4 pb-6">
        <DrawerTitle class="px-1 pt-1 text-[21px] font-extrabold tracking-[-0.02em]">
          Все коллекции
        </DrawerTitle>

        <label class="blc__search">
          <Icon name="lucide:search" class="size-[18px] shrink-0 text-muted-foreground" />
          <input
            v-model="query"
            type="search"
            placeholder="Поиск коллекции…"
            class="blc__search-input"
          >
        </label>

        <div class="blc__sheet-grid">
          <NuxtLink
            v-for="collection in found"
            :key="collection.id"
            :to="collection.href"
            class="blc__sheet-tile"
            @click="drawer = false"
          >
            <span
              class="blc__cover"
              :style="collection.cover ? { backgroundImage: `url(${collection.cover})` } : undefined"
            />
            <span class="blc__text">
              <span class="blc__name">{{ collection.name }}</span>
              <span
                class="blc__count"
                :class="{ 'blc__count--empty': collection.isEmpty }"
              >{{ collection.countLabel }}</span>
            </span>
          </NuxtLink>

          <span v-if="found.length === 0" class="blc__no-match">
            Ничего не нашли — попробуйте другое название
          </span>
        </div>
      </DrawerContent>
    </Drawer>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blc {
    margin-top: 28px;
  }

  .blc__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .blc__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 23px;
    letter-spacing: -0.025em;
  }

  .blc__tools {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  /* Стрелки — только там, где есть мышь: пальцем лента листается сама. */
  .blc__arrows {
    display: none;
    gap: 6px;
  }

  .blc__arrow {
    display: grid;
    place-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    box-shadow: 0 4px 12px rgb(15 23 42 / 0.07);
    color: var(--foreground);
    cursor: pointer;
  }

  .blc__arrow:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .blc__all {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 15px;
    border: 1px solid rgb(43 127 255 / 0.28);
    border-radius: 999px;
    background: rgb(43 127 255 / 0.09);
    color: var(--primary);
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
  }

  .blc__rail {
    display: flex;
    gap: 12px;
    /* Лента едет от края до края экрана — как в макете. */
    margin-inline: calc(-1 * var(--page-gutter));
    padding: 2px var(--page-gutter) 10px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scroll-padding-inline: var(--page-gutter);
    scrollbar-width: none;
    cursor: grab;
    touch-action: pan-x pan-y;
  }

  .blc__rail::-webkit-scrollbar {
    display: none;
  }

  .blc__tile {
    display: flex;
    flex: none;
    flex-direction: column;
    width: 172px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--card);
    box-shadow: 0 6px 16px rgb(15 23 42 / 0.08);
    text-align: left;
    scroll-snap-align: start;
    cursor: pointer;
    overflow: hidden;
    transition:
      box-shadow 0.14s ease,
      border-color 0.14s ease;
  }

  .blc__tile--on {
    border: 2px solid var(--primary);
    box-shadow: 0 10px 24px rgb(43 127 255 / 0.2);
  }

  .blc__cover {
    display: block;
    width: 100%;
    background-color: var(--muted);
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.09);
    aspect-ratio: 16 / 11;
  }

  .blc__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 11px 11px;
    text-align: left;
  }

  .blc__name {
    color: var(--foreground);
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .blc__count {
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 11.5px;
  }

  /* Пустая серия — не серым, а обещанием: её ещё привезут. */
  .blc__count--empty {
    color: var(--primary);
  }

  .blc__search {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 46px;
    margin: 12px 0 14px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
  }

  .blc__search-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--foreground);
    font-weight: 500;
    font-size: 15px;
    outline: none;
  }

  .blc__sheet-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    max-height: 60vh;
    padding-bottom: 4px;
    overflow-y: auto;
  }

  .blc__sheet-tile {
    display: block;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    box-shadow: 0 6px 18px rgb(15 23 42 / 0.08);
    overflow: hidden;
  }

  .blc__sheet-tile:active {
    transform: scale(0.97);
  }

  .blc__no-match {
    grid-column: span 2;
    padding: 26px 4px;
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 14px;
    text-align: center;
  }

  @media (min-width: 760px) {
    .blc {
      margin-top: 44px;
    }

    .blc__title {
      font-size: 30px;
    }

    .blc__arrows {
      display: inline-flex;
    }

    .blc__rail {
      margin-inline: 0;
      padding: 2px 2px 6px;
      scroll-padding-inline: 0;
    }

    .blc__tile {
      width: 214px;
    }
  }
}
</style>
