<script setup lang="ts">
import type { CategoryMenuItem } from '@/types'
import CategoryTile from '@/components/category/CategoryTile.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
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
 *
 * Картинки плиток НИЧЕМ не обрабатываются — ни `blend`, ни подложки.
 *
 * Так исторически ведут себя плитки подкатегорий, и они выглядят правильно:
 * PNG/WebP у них с прозрачным фоном, картинка садится прямо на тинт. Замер
 * альфа-канала: у `mashinki` 83% пикселей прозрачны, у `boys` — 0%, зато 61%
 * непрозрачного белого.
 *
 * Пробовались и отброшены два обхода для непрозрачных картинок:
 *  • `blend` (mix-blend-mode: multiply) убирает белый фон, но красит саму
 *    картинку в цвет плитки — синее яйцо сливалось с голубым тинтом;
 *  • белая скруглённая подложка убирает и то и другое, но у прозрачных
 *    картинок выглядит лишним белым квадратом, а плитки в одной сетке
 *    получаются разнородными.
 *
 * Правильное решение — данные: картинка категории должна быть с прозрачным
 * фоном, как у подкатегорий. Тогда код обходов не требует вовсе.
 */
const categoriesStore = useCategoriesStore()
const { getVariantUrl } = useSupabaseStorage()
/*
 * Раскладки разведены по 768 (в прототипе `mob = vw < 768`), а не по 1024:
 * с 768 и выше бенто, ниже — двухрядный рельс. Граница живёт ТОЛЬКО в
 * медиазапросах в конце файла.
 *
 * Раньше её знал ещё и JS: `useIsMobile(767)`. На сервере он всегда false,
 * то есть SSR нарисовал бы десктопное бенто, а мобильный клиент после
 * гидрации перекинул бы на рельс — расхождение и сдвиг. Из-за этого секцию
 * и держали за `requestIdleCallback` в index.vue, и в серверную разметку она
 * не попадала вовсе (замер прода 24 августа: появлялась на 4641 мс).
 *
 * На табе «Всё» обе раскладки показывают одни и те же 10 плиток
 * (`focusTiles` = bentoBig + bentoSmall), поэтому их можно держать в разметке
 * разом и прятать медиазапросом. JS о ширине окна больше не знает.
 */

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

function tintFor(index: number): string {
  return CATEGORY_TILE_TINTS[index % CATEGORY_TILE_TINTS.length]
    ?? CATEGORY_TILE_TINT_FALLBACK
}

/*
 * Плитке нужен `sm`, а не `md`, и обязательно `srcset` с `sizes`.
 *
 * Было: `md` без srcset и без sizes. То есть на плитку шириной 150 CSS-пикселей
 * уезжала картинка на 800 пикселей. Замер 24 августа на главной (390px,
 * CPU ×4, Slow 4G): шесть таких плиток — 319 КБ, 43% всего, что скачивается
 * до DOMContentLoaded. Раньше это было незаметно, потому что секция
 * рисовалась на клиенте и в критический путь не попадала.
 *
 * Идиома взята из CatalogMobileSections: `src` = sm, `srcset` = sm 400w +
 * md 800w, `sizes` — по фактической ширине КАРТИНКИ, а не плитки. Разница
 * решающая: при layout="corner" картинка занимает 132px в плитке 150px, и
 * на экране с DPR 3 это 396px против порога варианта sm в 400px. Объяви
 * здесь 150px — и браузер возьмёт md на 800px, то есть впятеро тяжелее.
 * Замерено в браузере: 132×111 в плитке 150×150 на 390px; на 1440px
 * 278×315 в большой плитке и 147×144 в малой.
 */
function imageOf(item: CategoryMenuItem): string | null {
  if (!item.image_url)
    return null
  return getVariantUrl(BUCKET_NAME_CATEGORY, item.image_url, 'sm') || null
}

function srcsetOf(item: CategoryMenuItem): string | undefined {
  if (!item.image_url)
    return undefined
  const sm = getVariantUrl(BUCKET_NAME_CATEGORY, item.image_url, 'sm')
  const md = getVariantUrl(BUCKET_NAME_CATEGORY, item.image_url, 'md')
  if (!sm || !md || sm === md)
    return undefined
  return `${sm} 400w, ${md} 800w`
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
  srcset?: string
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
    srcset: srcsetOf(item),
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
      <h2 class="m-0 font-bold tracking-[-0.02em] text-[clamp(22px,3vw,32px)]">
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

      <!-- BENTO (таб «Всё»); ниже 768px скрыт медиазапросом -->
      <div v-if="isAllTab" class="cats-bento">
        <CategoryTile
          v-for="tile in bentoBig"
          :key="tile.id"
          :name="tile.name"
          :href="tile.href"
          :src="tile.image"
          :srcset="tile.srcset"
          sizes="(min-width: 1280px) 280px, 22vw"
          :tint="tile.tint"
          :meta="tile.countLabel"
          layout="corner"
          size="lg"
          interaction="lift"
        />

        <div class="cats-bento__small">
          <CategoryTile
            v-for="tile in bentoSmall"
            :key="tile.id"
            :name="tile.name"
            :href="tile.href"
            :src="tile.image"
            :srcset="tile.srcset"
            sizes="(min-width: 1280px) 150px, 14vw"
            :tint="tile.tint"
            layout="corner"
            size="md"
            interaction="lift"
          />
        </div>
      </div>

      <!-- FOCUS GRID (мобилка / конкретный таб).
           На табе «Всё» дублирует плитки бенто и скрывается с 768px. -->
      <div class="cats-focus-scroll" :class="{ 'cats-focus-scroll--all': isAllTab }">
        <div class="cats-focus-grid">
          <CategoryTile
            v-for="tile in focusTiles"
            :key="tile.id"
            :name="tile.name"
            :href="tile.href"
            :src="tile.image"
            :srcset="tile.srcset"
            sizes="(max-width: 767px) 132px, 190px"
            :tint="tile.tint"
            layout="corner"
            size="md"
            interaction="lift"
          />
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
    /* Верхние 2px — запас под кромку таба: без них она срезалась
       переполнением по горизонтали. */
    padding: 2px 0 8px;
    margin-bottom: 18px;
  }

  /* Рельс табов уходит под края экрана (в прототипе — класс rail-bleed).
     Отступ строго из --page-gutter, см. assets/css/tailwind.css: свой clamp
     здесь разъедется с контейнером секции. */
  @media (max-width: 767px) {
    .cats-tabs {
      margin-inline: calc(-1 * var(--page-gutter));
      padding-inline: var(--page-gutter);
    }
  }

  .cats-tab {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 40px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: #fff;
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
    border-color: transparent;
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

  /* Переключение раскладок. Обе лежат в разметке, видна ровно одна.
     Граница 768 — та же, что у рельса ниже; разводить их нельзя. */
  @media (max-width: 767px) {
    .cats-bento {
      display: none;
    }
  }

  @media (min-width: 768px) {
    .cats-focus-scroll--all {
      display: none;
    }
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

  /* Вёрстка самих плиток — в components/category/CategoryTile.vue.
     Здесь остаётся только раскладка сетки вокруг них. */

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

  /* Мобильный focus-grid — двухрядный горизонтальный скролл.
     Граница 767/768 обязана совпадать с useIsMobile(767) выше: раскладку
     выбирает скрипт, а рельс рисует этот медиазапрос. */
  @media (max-width: 767px) {
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
