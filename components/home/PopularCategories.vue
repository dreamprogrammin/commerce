<script setup lang="ts">
import type { CategoryMenuItem } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useIsMobile } from '@/composables/useIsMobile'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import {
  CATEGORY_TILE_TINT_FALLBACK,
  CATEGORY_TILE_TINTS,
} from '@/constants/homePlaceholders'
import { sectionSpacingVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

/**
 * «Популярные категории» (Homepage.dc.html: секция categories).
 *
 * Табы = синтетический «Всё» + корневые категории из categoriesStore.menuTree.
 * Раскладка:
 *   • bento — только на десктопе и только на табе «Всё» (2 больших + 8 малых);
 *   • focus-grid — во всех остальных случаях (мобилка всегда, либо конкретный
 *     корневой таб на десктопе): плитки = подкатегории выбранного корня.
 * Подпись-счётчик у больших плиток = число дочерних категорий
 * (в прототипе cnt:10/12 совпадали с длиной CATSUB — это дети, не товары).
 */
const categoriesStore = useCategoriesStore()
const { getVariantUrl } = useSupabaseStorage()
const isMobile = useIsMobile(1023)

// menuTree наполняется на SSR через useAsyncData('home-ssr-critical') в index.vue;
// подстраховка на клиенте, если стор пуст.
//
// Заодно догружаем LQIP-подложки: в общей выборке категорий их нет (весили
// половину сжатого документа), а этот блок и так монтируется только на
// клиенте — index.vue поднимает shouldRenderSecondaryBlocks по
// requestIdleCallback, так что в SSR-разметке плиток нет вовсе.
onMounted(async () => {
  if (!categoriesStore.menuTree.length)
    await categoriesStore.fetchCategoryData()
  void categoriesStore.loadCategoryBlurPlaceholders()
})

const roots = computed<CategoryMenuItem[]>(() =>
  (categoriesStore.menuTree ?? []).filter(c => c.display_in_menu !== false),
)

const showSkeleton = computed(() => roots.value.length === 0)

// --- табы ---
const activeTab = ref('all')
const MAX_ROOT_TABS = 6

const tabs = computed(() => {
  const rootTabs = roots.value.slice(0, MAX_ROOT_TABS).map(r => ({
    key: r.slug,
    name: r.name,
    icon: r.icon_name || 'lucide:shapes',
  }))
  return [
    { key: 'all', name: 'Всё', icon: 'lucide:sparkles' },
    ...rootTabs,
  ]
})

const isAllTab = computed(() => activeTab.value === 'all')
const showBento = computed(() => isAllTab.value && !isMobile.value)

function tintFor(index: number): string {
  return CATEGORY_TILE_TINTS[index % CATEGORY_TILE_TINTS.length]
    ?? CATEGORY_TILE_TINT_FALLBACK
}

function imageOf(item: CategoryMenuItem): string | null {
  if (!item.image_url)
    return null
  return getVariantUrl(BUCKET_NAME_CATEGORY, item.image_url, 'md') || null
}

function hrefOf(item: CategoryMenuItem): string {
  return item.href || `/catalog/${item.slug}`
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1]
  return forms[2]
}

interface Tile {
  id: string
  name: string
  href: string
  image: string | null
  blur: string | null
  tint: string
  countLabel?: string
}

function toTile(item: CategoryMenuItem, tintIndex: number, withCount = false): Tile {
  const childCount = item.children?.length ?? 0
  return {
    id: item.id,
    name: item.name,
    href: hrefOf(item),
    image: imageOf(item),
    blur: item.blur_placeholder,
    tint: tintFor(tintIndex),
    countLabel: withCount
      ? (childCount > 0
          ? `${childCount} ${plural(childCount, ['категория', 'категории', 'категорий'])}`
          : 'Смотреть')
      : undefined,
  }
}

// Большие плитки бенто — первые два корня.
const bentoBig = computed<Tile[]>(() =>
  roots.value.slice(0, 2).map((r, i) => toTile(r, i, true)),
)

// Малые плитки бенто — 8 штук: сперва остальные корни, затем дети ранних корней.
const bentoSmall = computed<Tile[]>(() => {
  const pool: Array<{ item: CategoryMenuItem, tint: number }> = []
  roots.value.slice(2).forEach((r, i) => pool.push({ item: r, tint: i + 2 }))
  roots.value.forEach((r, ri) =>
    (r.children ?? []).forEach(ch => pool.push({ item: ch, tint: ri })),
  )
  const seen = new Set<string>()
  const out: Tile[] = []
  for (const { item, tint } of pool) {
    if (seen.has(item.id))
      continue
    seen.add(item.id)
    out.push(toTile(item, tint))
    if (out.length >= 8)
      break
  }
  return out
})

// Плитки focus-grid.
const focusTiles = computed<Tile[]>(() => {
  if (isAllTab.value)
    return [...bentoBig.value, ...bentoSmall.value]
  const rootIndex = roots.value.findIndex(r => r.slug === activeTab.value)
  const root = roots.value[rootIndex]
  if (!root)
    return []
  return (root.children ?? []).map(ch => toTile(ch, rootIndex))
})

const seeAllHref = '/catalog/all'
</script>

<template>
  <section :class="sectionSpacingVariants({ size: 'xs' })">
    <div class="flex items-baseline justify-between gap-3 mb-4">
      <h2 class="m-0 font-bold tracking-tight text-[clamp(22px,3vw,32px)]">
        Популярные категории
      </h2>
      <NuxtLink
        :to="seeAllHref"
        class="inline-flex items-center gap-1.5 text-primary font-semibold text-sm whitespace-nowrap hover:underline"
      >
        Все категории
        <Icon name="lucide:arrow-right" class="size-4" />
      </NuxtLink>
    </div>

    <!-- skeleton -->
    <div v-if="showSkeleton" class="cats-skeleton">
      <div v-for="i in 8" :key="i" class="cats-skeleton__tile" />
    </div>

    <template v-else>
      <!-- табы категорий -->
      <div class="cats-tabs hs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="cats-tab"
          :class="{ 'cats-tab--active': tab.key === activeTab }"
          @click="activeTab = tab.key"
        >
          <Icon :name="tab.icon" class="size-4" />
          {{ tab.name }}
        </button>
      </div>

      <!-- BENTO (десктоп, таб «Всё») -->
      <div v-if="showBento" class="cats-bento">
        <NuxtLink
          v-for="tile in bentoBig"
          :key="tile.id"
          :to="tile.href"
          class="cats-tile cats-tile--big"
          :style="{ background: tile.tint }"
        >
          <span class="cats-tile__title cats-tile__title--big">{{ tile.name }}</span>
          <span class="cats-tile__count">
            {{ tile.countLabel }}
            <Icon name="lucide:arrow-right" class="size-4" />
          </span>
          <span class="cats-tile__img cats-tile__img--big">
            <img v-if="tile.image" :src="tile.image" :alt="tile.name" loading="lazy">
          </span>
        </NuxtLink>

        <div class="cats-bento__small">
          <NuxtLink
            v-for="tile in bentoSmall"
            :key="tile.id"
            :to="tile.href"
            class="cats-tile cats-tile--small"
            :style="{ background: tile.tint }"
          >
            <span class="cats-tile__title">{{ tile.name }}</span>
            <span class="cats-tile__img cats-tile__img--small">
              <img v-if="tile.image" :src="tile.image" :alt="tile.name" loading="lazy">
            </span>
          </NuxtLink>
        </div>
      </div>

      <!-- FOCUS GRID (мобилка / конкретный таб) -->
      <div v-else class="cats-focus-scroll">
        <div class="cats-focus-grid">
          <NuxtLink
            v-for="tile in focusTiles"
            :key="tile.id"
            :to="tile.href"
            class="cats-tile cats-tile--small"
            :style="{ background: tile.tint }"
          >
            <span class="cats-tile__title">{{ tile.name }}</span>
            <span class="cats-tile__img cats-tile__img--small">
              <img v-if="tile.image" :src="tile.image" :alt="tile.name" loading="lazy">
            </span>
          </NuxtLink>
        </div>
      </div>
    </template>
  </section>
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
  .cats-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 6px;
    margin-bottom: 18px;
  }

  .cats-tab {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 38px;
    padding: 0 15px;
    border: none;
    border-radius: 999px;
    background: var(--muted);
    color: var(--foreground);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .cats-tab--active {
    background: var(--primary);
    color: #fff;
  }

  /* --- bento --- */
  .cats-bento {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(0, 2.7fr);
    gap: 14px;
    height: 404px;
  }

  .cats-bento__small {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 14px;
    height: 100%;
  }

  /* --- focus grid --- */
  .cats-focus-scroll {
    overflow: visible;
  }

  .cats-focus-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    grid-auto-rows: 190px;
    gap: 14px;
  }

  /* --- tiles --- */
  .cats-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    border: none;
    cursor: pointer;
    text-align: left;
    text-decoration: none;
    overflow: hidden;
    transition:
      transform 0.16s ease,
      box-shadow 0.16s ease;
  }

  .cats-tile--big {
    min-height: 180px;
    border-radius: 22px;
    padding: 24px 22px 0;
  }

  .cats-tile--small {
    min-height: 150px;
    border-radius: 18px;
    padding: 15px 10px 0;
  }

  .cats-tile--big:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
  }

  .cats-tile--small:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }

  .cats-tile__title {
    position: relative;
    z-index: 2;
    display: block;
    max-width: 100%;
    padding-right: 6px;
    color: var(--foreground);
    font-weight: 700;
    font-size: clamp(11px, 1.1vw, 14px);
    line-height: 1.2;
    text-wrap: balance;
  }

  .cats-tile__title--big {
    max-width: 72%;
    font-weight: 800;
    font-size: clamp(22px, 1.9vw, 30px);
    line-height: 1.08;
    letter-spacing: -0.02em;
  }

  .cats-tile__count {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 11px;
    color: var(--primary);
    font-weight: 600;
    font-size: 13.5px;
  }

  .cats-tile__img {
    position: absolute;
    z-index: 1;
  }

  .cats-tile__img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: right bottom;
    display: block;
  }

  .cats-tile__img--big {
    right: 0;
    bottom: 0;
    width: 82%;
    height: 62%;
  }

  .cats-tile__img--small {
    right: 2px;
    bottom: 2px;
    width: 76%;
    height: 62%;
  }

  /* --- skeleton --- */
  .cats-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 14px;
  }

  .cats-skeleton__tile {
    height: 190px;
    border-radius: 18px;
    background: var(--muted);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }

  /* Мобильный focus-grid — двухрядный горизонтальный скролл (< lg). */
  @media (max-width: 1023px) {
    /* Edge-bleed: отступ строго из --page-gutter (см. assets/css/tailwind.css),
       иначе рельс не совпадает с контейнером секции. */
    .cats-focus-scroll {
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      margin-inline: calc(-1 * var(--page-gutter));
      scrollbar-width: none;
    }

    .cats-focus-scroll::-webkit-scrollbar {
      display: none;
    }

    .cats-focus-grid {
      grid-auto-flow: column;
      grid-template-columns: none;
      grid-template-rows: repeat(2, 150px);
      grid-auto-columns: 150px;
      grid-auto-rows: auto;
      gap: 12px;
      width: max-content;
      padding-inline: var(--page-gutter);
      padding-bottom: 6px;
    }
  }
}
</style>
