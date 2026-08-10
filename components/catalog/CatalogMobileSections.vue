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
 *  • Картинка тайла в прототипе — background-image; здесь честный <img> с
 *    srcset и lazy, потому что файлы лежат в Supabase Storage вариантами
 *    sm/md, а `background-image` их не умеет выбирать.
 *  • LQIP тут намеренно нет: тайл ~112px, вариант `sm` (400px) прилетает
 *    мгновенно, а размытый плейсхолдер под `mix-blend-mode: multiply`
 *    проступает сквозь прозрачный PNG грязным пятном.
 */
import type { AdditionalMenuItem, CategoryRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { isDiscountPromo } from '@/utils/promoTiles'

const props = defineProps<{
  categories: CategoryRow[]
  promos: AdditionalMenuItem[]
}>()

const { getVariantUrl } = useSupabaseStorage()

/** Прозрачный 1×1 GIF — заглушка в <img src>, см. комментарий в разметке. */
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

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
      :style="{ '--tile-tint': section.tint }"
    >
      <NuxtLink :to="section.href" class="cat-mob__section-title">
        {{ section.name }}
      </NuxtLink>

      <div class="cat-mob__grid">
        <NuxtLink
          v-for="item in section.items"
          :key="item.id"
          :to="item.href"
          class="cat-mob__cell"
        >
          <span class="cat-surface cat-mob__tile">
            <!-- Картинка живёт в <source media>, а у <img> в src прозрачный
                 пиксель. Ниже lg источник совпадает и грузится настоящий файл,
                 на десктопе (где блок скрыт через display:none) не совпадает —
                 и браузер не качает ничего. Без этого десктоп тянул бы все
                 27 картинок мобильной вёрстки вхолостую: display:none
                 загрузку не отменяет. -->
            <picture v-if="item.src" class="cat-mob__pic">
              <source
                media="(max-width: 1023.98px)"
                :srcset="item.srcset || item.src"
                sizes="(max-width: 767px) 33vw, 180px"
              >
              <img
                :src="BLANK_PIXEL"
                alt=""
                loading="lazy"
                decoding="async"
                class="cat-mob__img"
              >
            </picture>
            <Icon v-else :name="item.icon" class="cat-mob__fallback" />
          </span>
          <span class="cat-mob__name">{{ item.name }}</span>
        </NuxtLink>
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

  /* Общая «стеклянная» подложка плиток: светлый градиент от --tile-tint,
     белая кромка и внутренние тени, дающие объём. */
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

  .cat-mob__cell {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cat-mob__tile {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    /* mix-blend-mode картинки обязан смешиваться с градиентом самой плитки,
       а не с тем, что под ней на странице. */
    isolation: isolate;
    transition: transform 0.2s ease;
  }

  .cat-mob__cell:active .cat-mob__tile {
    transform: scale(0.96);
  }

  /* Коробка под картинку — 78% от плитки, как в прототипе. Размер задаётся
     через ширину и aspect-ratio, а не через height:78%: процентная высота
     внутри грид-ячейки, чья высота сама выведена из aspect-ratio, не
     резолвится, и картинка вытягивалась по своим пропорциям (портретные
     обрезались бы краем плитки). Плитка квадратная, так что 78% ширины =
     78% высоты. */
  .cat-mob__pic {
    display: block;
    width: 78%;
    aspect-ratio: 1;
  }

  .cat-mob__img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* Картинки категорий — PNG с белым ореолом по краю; multiply сажает их
       на подложку без видимой рамки. */
    mix-blend-mode: multiply;
  }

  .cat-mob__fallback {
    width: 40%;
    height: 40%;
    color: var(--muted-foreground);
    opacity: 0.45;
  }

  .cat-mob__name {
    display: -webkit-box;
    min-height: 35px;
    overflow: hidden;
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--foreground);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
</style>
