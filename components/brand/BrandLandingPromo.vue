<script setup lang="ts">
/**
 * «Акции и новинки» — макет `Бренд LEGO.dc.html`, лента широких плашек.
 *
 * Плашка на серию: обложка коллекции, повод (новинка, скидка или просто
 * наличие) и короткая справка о цене и возрасте. Нажатие переводит подборку
 * ниже на эту серию.
 *
 * Поводы считаются по товарам, а не заводятся руками: отдельной таблицы
 * акций у брендов нет, а выдумывать текст на странице магазина нельзя.
 */
import type { ProductLine, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { formatPrice } from '@/utils/formatPrice'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  products: ProductWithGallery[]
  lines: ProductLine[]
  /** id товара → id коллекции. Выдача RPC своей линейки не отдаёт. */
  lineByProduct: Record<string, string>
}>()

const emit = defineEmits<{ pickLine: [lineId: string] }>()

const { getVariantUrl } = useSupabaseStorage()
const { railRef, atStart, atEnd, syncEdges, nudge, onMouseDown } = useRailScroll()

/** Сколько плашек показываем: больше — и лента превращается в ещё одну сетку. */
const MAX_SLIDES = 4
/** Ниже этого процента скидка поводом не считается. */
const MIN_DISCOUNT = 5

function productsOf(lineId: string) {
  return props.products.filter(p => props.lineByProduct[p.id] === lineId)
}

/** Самый свежий товар бренда — его серия и получает повод «Новинка серии». */
const newestLineId = computed(() => {
  const newest = [...props.products].sort(
    (a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''),
  )[0]
  return newest ? props.lineByProduct[newest.id] ?? null : null
})

const slides = computed(() => {
  const rows = props.lines
    .map((line) => {
      const items = productsOf(line.id)
      if (items.length === 0)
        return null

      const maxDiscount = Math.max(...items.map(p => p.discount_percentage ?? 0))
      const minPrice = Math.min(...items.map(p => p.final_price ?? p.price))
      const ages = items
        .map(p => (p as any).min_age_years as number | null)
        .filter((n): n is number => n != null)

      const isNew = line.id === newestLineId.value
      const kicker = isNew
        ? 'Новинка серии'
        : maxDiscount >= MIN_DISCOUNT
          ? `Скидки до ${Math.round(maxDiscount)}%`
          : `${items.length} ${pluralRu(items.length, 'набор', 'набора', 'наборов')} в наличии`

      const note = [
        `От ${formatPrice(minPrice)} ₸`,
        ages.length ? `для детей от ${Math.min(...ages)} лет` : '',
      ]
        .filter(Boolean)
        .join(' · ')

      const cover = line.logo_url
        ? getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'md')
        : (() => {
            const path = items[0]?.product_images?.[0]?.image_url
            return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md') : null
          })()

      return {
        id: line.id,
        cover,
        kicker,
        title: line.name,
        note,
        // Порядок: сначала новинка, потом скидки, потом самые полные серии.
        weight: isNew ? 1000 : maxDiscount >= MIN_DISCOUNT ? 500 + maxDiscount : items.length,
      }
    })
    .filter(Boolean) as {
    id: string
    cover: string | null
    kicker: string
    title: string
    note: string
    weight: number
  }[]

  return rows.sort((a, b) => b.weight - a.weight).slice(0, MAX_SLIDES)
})

onMounted(() => nextTick(syncEdges))
watch(slides, () => nextTick(syncEdges))
</script>

<template>
  <!-- Одна плашка лентой не выглядит: секция появляется от двух серий. -->
  <section v-if="slides.length > 1" class="blm">
    <div class="blm__head">
      <h2 class="blm__title">
        Акции и новинки
      </h2>
      <span class="blm__arrows">
        <button
          type="button"
          class="blm__arrow"
          :disabled="atStart"
          aria-label="Предыдущая подборка"
          @click="nudge(-1, 0.55)"
        >
          <Icon name="lucide:chevron-left" class="size-[18px]" />
        </button>
        <button
          type="button"
          class="blm__arrow"
          :disabled="atEnd"
          aria-label="Следующая подборка"
          @click="nudge(1, 0.55)"
        >
          <Icon name="lucide:chevron-right" class="size-[18px]" />
        </button>
      </span>
    </div>

    <div
      ref="railRef"
      class="blm__rail"
      @scroll="syncEdges"
      @mousedown="onMouseDown"
    >
      <button
        v-for="slide in slides"
        :key="slide.id"
        type="button"
        class="blm__slide"
        :style="slide.cover ? { backgroundImage: `url(${slide.cover})` } : undefined"
        @click="emit('pickLine', slide.id)"
      >
        <span class="blm__shade" />
        <span class="blm__body">
          <span class="blm__kicker">{{ slide.kicker }}</span>
          <span class="blm__slide-title">{{ slide.title }}</span>
          <span class="blm__note">{{ slide.note }}</span>
          <span class="blm__cta">
            Открыть серию
            <Icon name="lucide:arrow-right" class="size-[15px]" />
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blm {
    margin-top: 28px;
  }

  .blm__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .blm__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 23px;
    letter-spacing: -0.025em;
  }

  .blm__arrows {
    display: none;
    gap: 6px;
  }

  .blm__arrow {
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

  .blm__arrow:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .blm__rail {
    display: flex;
    gap: 14px;
    margin-inline: calc(-1 * var(--page-gutter));
    padding: 2px var(--page-gutter) 4px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: var(--page-gutter);
    scrollbar-width: none;
    cursor: grab;
    touch-action: pan-x pan-y;
  }

  .blm__rail::-webkit-scrollbar {
    display: none;
  }

  .blm__slide {
    position: relative;
    flex: none;
    width: 84%;
    border: 1px solid rgb(255 255 255 / 0.5);
    border-radius: 20px;
    background-color: #0e1a33;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    box-shadow: 0 12px 30px rgb(15 23 42 / 0.14);
    text-align: left;
    aspect-ratio: 16 / 10;
    scroll-snap-align: start;
    cursor: pointer;
    overflow: hidden;
  }

  .blm__shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(96deg, rgb(8 14 28 / 0.86) 0%, rgb(8 14 28 / 0.55) 48%, rgb(8 14 28 / 0.08) 100%);
  }

  .blm__body {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 7px;
    padding: 18px;
  }

  .blm__kicker {
    color: #ffd84d;
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .blm__slide-title {
    max-width: 22ch;
    color: #fff;
    font-weight: 800;
    font-size: 19px;
    line-height: 1.2;
    letter-spacing: -0.02em;
    text-wrap: pretty;
  }

  .blm__note {
    max-width: 30ch;
    color: rgb(255 255 255 / 0.8);
    font-weight: 500;
    font-size: 13px;
  }

  .blm__cta {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 7px;
    height: 38px;
    margin-top: 5px;
    padding: 0 16px;
    border-radius: 999px;
    background: #fff;
    color: #0e1a33;
    font-weight: 700;
    font-size: 13px;
  }

  @media (min-width: 760px) {
    .blm {
      margin-top: 44px;
    }

    .blm__title {
      font-size: 30px;
    }

    .blm__arrows {
      display: inline-flex;
    }

    .blm__rail {
      margin-inline: 0;
      padding: 2px;
      scroll-padding-inline: 0;
    }

    .blm__slide {
      width: 62%;
      border-radius: 24px;
      aspect-ratio: 16 / 8;
    }

    .blm__body {
      padding: 24px 26px;
    }

    .blm__slide-title {
      font-size: 22px;
    }
  }

  @media (min-width: 1200px) {
    .blm__slide {
      width: 44%;
    }
  }
}
</style>
