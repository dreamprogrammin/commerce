<script setup lang="ts">
/**
 * Мобильный каталог — секции по корневым категориям.
 * Порт прототипа Claude Design `Каталог.dc.html` (проект «Прототип для покупателей»).
 *
 * Отличия от прототипа и почему:
 *  • Прототип держит категории захардкоженным массивом с полем `tint`. В базе
 *    поля под цвет нет, поэтому оттенок берётся из карты по slug корня, а для
 *    незнакомого корня — циклом по той же палитре (иначе новая категория в
 *    админке приезжала бы без фона).
 *  • LQIP тут намеренно нет: тайл ~112px, вариант `sm` (400px) прилетает
 *    мгновенно, а размытый плейсхолдер под `mix-blend-mode: multiply`
 *    проступает сквозь прозрачный PNG грязным пятном.
 *
 * Сами плитки рисует `CategoryTile` — общий порт `CategoryTile.dc.html`.
 * Раскладка тут stack + подпись снизу; про `blend`, `sourceMedia` и
 * несовместимость наложения с тенью написано в шапке того компонента.
 */
import type { AdditionalMenuItem, CategoryRow } from '@/types'
import CategoryTile from '@/components/category/CategoryTile.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { isDiscountPromo } from '@/utils/promoTiles'

const props = defineProps<{
  categories: CategoryRow[]
  promos: AdditionalMenuItem[]
}>()

const { getVariantUrl } = useSupabaseStorage()

/**
 * Пастельные подложки секций из прототипа. Ключ — slug корневой категории.
 * «Игры» в прототипе не было (там шло «Активный отдых»), поэтому коралловый
 * добавлен в тон остальным: палитра закрывает синий/розовый/янтарный/зелёный/
 * фиолетовый/бирюзовый, кораллового не хватало.
 */
const SECTION_TINTS: Record<string, string> = {
  'boys': '#dff0ff',
  'girls': '#ffe9f3',
  'kiddy': '#fff3d9',
  'constructors-root': '#e6f7e9',
  'creativity': '#f1e9ff',
  'games': '#ffe9e2',
  'holyday': '#e0f5f7',
}

const TINT_CYCLE = Object.values(SECTION_TINTS)

const promoTiles = computed(() =>
  props.promos.map(item => ({
    ...item,
    icon: item.icon || 'lucide:sparkles',
    // Скидочной плитке — «бонусный» оранжевый, остальным фирменный синий.
    accent: isDiscountPromo(item.id) ? 'bonus' : 'brand',
  })),
)

const sections = computed(() => {
  const all = props.categories

  return all
    .filter(cat => cat.is_root_category && cat.display_in_menu)
    .sort((a, b) => a.display_order - b.display_order)
    .map((root, index) => ({
      id: root.id,
      name: root.name,
      href: root.href,
      tint: SECTION_TINTS[root.slug] ?? TINT_CYCLE[index % TINT_CYCLE.length],
      items: all
        .filter(cat => cat.parent_id === root.id && cat.display_in_menu)
        .sort((a, b) => a.display_order - b.display_order)
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          href: cat.href,
          icon: cat.icon_name || 'lucide:package',
          src: getVariantUrl(BUCKET_NAME_CATEGORY, cat.image_url, 'sm'),
          srcset: buildSrcset(cat.image_url),
        })),
    }))
    .filter(section => section.items.length > 0)
})

function buildSrcset(imageUrl: string | null): string | undefined {
  const sm = getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'sm')
  const md = getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'md')
  if (!sm || !md || sm === md)
    return undefined
  return `${sm} 400w, ${md} 800w`
}
</script>

<template>
  <div class="cat-mob">
    <h1 class="cat-mob__title">
      Каталог
    </h1>

    <div v-if="promoTiles.length > 0" class="cat-mob__promos">
      <NuxtLink
        v-for="promo in promoTiles"
        :key="promo.id"
        :to="promo.href"
        class="cat-surface cat-mob__promo"
        :style="{ '--tile-tint': promo.accent === 'bonus' ? 'var(--bonus-surface)' : 'var(--brand-surface)' }"
      >
        <Icon
          :name="promo.icon"
          class="cat-mob__promo-icon"
          :class="promo.accent === 'bonus' ? 'text-bonus' : 'text-primary'"
        />
        <span class="cat-mob__promo-label">{{ promo.name }}</span>
      </NuxtLink>
    </div>

    <section
      v-for="section in sections"
      :key="section.id"
      class="cat-mob__section"
    >
      <NuxtLink :to="section.href" class="cat-mob__section-title">
        {{ section.name }}
      </NuxtLink>

      <div class="cat-mob__grid">
        <CategoryTile
          v-for="item in section.items"
          :key="item.id"
          :name="item.name"
          :href="item.href"
          :src="item.src"
          :srcset="item.srcset"
          sizes="(max-width: 767px) 33vw, 180px"
          source-media="(max-width: 1023.98px)"
          :fallback-icon="item.icon"
          :tint="section.tint"
          :flat="false"
          :radius="16"
          :img-scale="78"
          :img-shadow="0"
          blend
          :label-size="13.5"
          :label-weight="500"
          interaction="press"
        />
      </div>
    </section>
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
  .cat-mob {
    /* Верх задаёт layouts/Catalog.vue (pt-[56px] под фиксированной шапкой),
       снизу к его pb-16 добавляем до 110px из прототипа. */
    padding: 10px var(--page-gutter) 46px;
  }

  /* Ширина колонки из «десктопной» ветки прототипа: он и на широком экране
     остаётся телефоном по центру. Ниже lg страница всё ещё в мобильном
     обвесе (шапка и таббар прячутся только на lg). */
  @media (min-width: 768px) {
    .cat-mob {
      max-width: 560px;
      margin-inline: auto;
    }
  }

  /* «Стеклянная» подложка промо-плиток: светлый градиент от --tile-tint,
     белая кромка и внутренние тени, дающие объём. Плитки категорий несут
     свою — её задаёт CategoryTile при `:flat="false"`. */
  .cat-surface {
    background: linear-gradient(165deg, color-mix(in oklch, var(--tile-tint) 55%, #fff), var(--tile-tint));
    border: 1px solid rgb(255 255 255 / 0.75);
    border-radius: 16px;
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.9),
      inset 0 -12px 20px rgb(15 23 42 / 0.07),
      inset 0 0 18px rgb(255 255 255 / 0.28),
      0 6px 16px rgb(15 23 42 / 0.09);
  }

  .cat-mob__title {
    margin: 6px 2px 14px;
    font-size: 27px;
    font-weight: 800;
    line-height: normal;
    letter-spacing: -0.025em;
    color: var(--foreground);
  }

  .cat-mob__promos {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 8px;
  }

  .cat-mob__promo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 14px;
    color: var(--foreground);
  }

  .cat-mob__promo-icon {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
  }

  .cat-mob__promo-label {
    font-size: 14.5px;
    font-weight: 600;
    line-height: normal;
  }

  .cat-mob__section {
    margin-top: 30px;
  }

  .cat-mob__section-title {
    display: block;
    margin: 0 0 16px;
    font-size: 24px;
    font-weight: 800;
    line-height: normal;
    letter-spacing: -0.02em;
    color: var(--foreground);
    transition: color 0.15s ease;
  }

  .cat-mob__section-title:hover {
    color: var(--primary);
  }

  .cat-mob__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px 10px;
  }

  /* Вёрстка самих плиток — в components/category/CategoryTile.vue.
     Здесь остаётся только раскладка сетки вокруг них. */
}
</style>
