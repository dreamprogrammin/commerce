<script setup lang="ts">
/**
 * «Серии LEGO» — макет `Бренд LEGO v2.dc.html`, секция после шапки.
 *
 * Мозаика обложек: первая плитка крупная, остальные мельче; в углу каждой —
 * счётчик наборов. Нажатие переводит подборку ниже на эту серию. Кнопка «Все
 * серии» открывает шторку, и там плитки уже ССЫЛКИ на страницы серий:
 * перелинковки на них со страницы бренда раньше не было.
 *
 * Серия без товаров ссылкой не становится — её страница закрыта `noindex`.
 */
import type { Brand, ProductLine } from '@/types'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  brand: Brand
  lines: ProductLine[]
  /** Сколько товаров бренда лежит в каждой серии. */
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

const query = ref('')

const collections = computed(() =>
  props.lines.map((line) => {
    const count = props.lineCounts[line.id] ?? 0
    return {
      id: line.id,
      name: line.name,
      href: `/brand/${props.brand.slug}/${line.slug}`,
      cover: line.logo_url
        ? getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'md')
        : null,
      countLabel: count
        ? `${count} ${pluralRu(count, 'набор', 'набора', 'наборов')}`
        : 'Скоро в наличии',
      isEmpty: count === 0,
    }
  }),
)

const subtitle = computed(() => {
  const n = props.lines.length
  return `${n} ${pluralRu(n, 'серия', 'серии', 'серий')} бренда — выберите свою`
})

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

watch(drawer, (open) => {
  if (open)
    query.value = ''
})
</script>

<template>
  <section v-if="collections.length" class="blc">
    <div class="blc__inner">
      <div class="blc__head">
        <div class="blc__head-text">
          <h2 class="blc__title">
            Серии {{ brand.name }}
          </h2>
          <span class="blc__sub">{{ subtitle }}</span>
        </div>

        <button type="button" class="blc__all" @click="drawer = true">
          <Icon name="lucide:layout-grid" class="size-4 text-primary" />
          Все серии
        </button>
      </div>

      <div class="blc__bento">
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
          <span class="blc__cap" :class="{ 'blc__cap--empty': collection.isEmpty }">
            {{ collection.countLabel }}
          </span>
          <span class="blc__name">{{ collection.name }}</span>
        </button>
      </div>
    </div>

    <!-- Шторка «Все серии»: тот же список, но ссылками на страницы серий. -->
    <Drawer v-model:open="drawer">
      <DrawerContent class="mx-auto max-w-[520px] px-4 pb-6">
        <DrawerTitle class="px-1 pt-1 text-[21px] font-extrabold tracking-[-0.02em]">
          Все серии {{ brand.name }}
        </DrawerTitle>

        <label class="blc__search">
          <Icon name="lucide:search" class="size-[18px] shrink-0 text-muted-foreground" />
          <input
            v-model="query"
            type="search"
            placeholder="Поиск серии…"
            class="blc__search-input"
          >
        </label>

        <div class="blc__sheet-grid">
          <template v-for="collection in found" :key="collection.id">
            <NuxtLink
              v-if="!collection.isEmpty"
              :to="collection.href"
              class="blc__sheet-tile"
              @click="drawer = false"
            >
              <span
                class="blc__cover"
                :style="collection.cover ? { backgroundImage: `url(${collection.cover})` } : undefined"
              />
              <span class="blc__sheet-text">
                <span class="blc__sheet-name">{{ collection.name }}</span>
                <span class="blc__sheet-count">{{ collection.countLabel }}</span>
              </span>
            </NuxtLink>

            <div v-else class="blc__sheet-tile blc__sheet-tile--empty">
              <span
                class="blc__cover"
                :style="collection.cover ? { backgroundImage: `url(${collection.cover})` } : undefined"
              />
              <span class="blc__sheet-text">
                <span class="blc__sheet-name">{{ collection.name }}</span>
                <span class="blc__sheet-count blc__sheet-count--empty">{{ collection.countLabel }}</span>
              </span>
            </div>
          </template>

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
    padding: 34px 0;
    background: var(--background);
  }

  .blc__inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blc__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }

  .blc__head-text {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .blc__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.03em;
  }

  .blc__sub {
    color: var(--muted-foreground);
    font-size: 14.5px;
  }

  .blc__all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }

  .blc__all:hover {
    background: var(--muted);
  }

  /* Мозаика: на телефоне квадраты по два в ряд. */
  .blc__bento {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .blc__tile {
    position: relative;
    display: block;
    padding: 0;
    border: 1px solid rgb(15 23 42 / 0.08);
    border-radius: 14px;
    background: var(--muted);
    box-shadow: 0 4px 14px rgb(15 23 42 / 0.08);
    aspect-ratio: 1 / 1;
    cursor: pointer;
    overflow: hidden;
  }

  .blc__tile--on {
    border: 2px solid var(--primary);
    box-shadow: 0 12px 26px rgb(43 127 255 / 0.2);
  }

  .blc__cover {
    position: absolute;
    inset: 0;
    background-color: var(--muted);
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
  }

  .blc__cap {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 5px 11px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.94);
    box-shadow: 0 2px 8px rgb(15 23 42 / 0.18);
    color: #0b2444;
    font-weight: 700;
    font-size: 12px;
  }

  .blc__cap--empty {
    color: var(--primary);
  }

  /*
   * Название серии поверх обложки. В макете его нет — обложки там с
   * надписями. У нас логотип серии не всегда читается на плитке, а имя нужно
   * и человеку, и роботу: текстом, а не картинкой.
   */
  .blc__name {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 22px 12px 10px;
    background: linear-gradient(180deg, rgb(11 36 68 / 0) 0%, rgb(11 36 68 / 0.78) 100%);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    text-align: left;
    text-shadow: 0 1px 6px rgb(11 36 68 / 0.6);
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
    position: relative;
    display: block;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card);
    box-shadow: 0 6px 18px rgb(15 23 42 / 0.08);
    overflow: hidden;
  }

  .blc__sheet-tile .blc__cover {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 11;
  }

  .blc__sheet-tile:active {
    transform: scale(0.97);
  }

  /* Пустая серия — карточка-обещание, нажимать не на что. */
  .blc__sheet-tile--empty {
    opacity: 0.72;
    cursor: default;
  }

  .blc__sheet-tile--empty:active {
    transform: none;
  }

  .blc__sheet-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 11px 11px;
  }

  .blc__sheet-name {
    color: var(--foreground);
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .blc__sheet-count {
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 11.5px;
  }

  .blc__sheet-count--empty {
    color: var(--primary);
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
      padding: 64px 0;
    }

    .blc__title {
      font-size: 34px;
    }

    .blc__head {
      margin-bottom: 22px;
    }

    .blc__bento {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-auto-rows: 150px;
      gap: 14px;
    }

    .blc__tile {
      border-radius: 18px;
      aspect-ratio: auto;
    }

    /* Первая плитка — крупная, четвёртая вытянута вниз: ритм из макета. */
    .blc__tile:first-child {
      grid-row: span 2;
      grid-column: span 2;
    }

    .blc__tile:nth-child(4) {
      grid-row: span 2;
    }

    .blc__name {
      font-size: 15px;
    }
  }

  @media (min-width: 1200px) {
    .blc__bento {
      grid-auto-rows: 176px;
    }
  }
}
</style>
