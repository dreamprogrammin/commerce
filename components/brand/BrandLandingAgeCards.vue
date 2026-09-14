<script setup lang="ts">
/**
 * «Наборы по возрасту» — макет `Бренд LEGO v2.dc.html`.
 *
 * Три карточки-подсказки: нажатие выставляет отрезок возраста в подборке
 * выше и ведёт к ней. Счётчик считает ПЕРЕСЕЧЕНИЕ отрезков — набор «4–12
 * лет» подходит и шестилетке, и десятилетке, поэтому попадает в две
 * карточки. Сумма по карточкам больше числа наборов, и это не ошибка.
 */
import type { ProductWithGallery } from '@/types'
import { BRAND_AGE_CARDS } from '@/utils/brandAgeCards'
import { matchesAge } from '@/utils/brandLandingFilters'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  products: ProductWithGallery[]
}>()

const emit = defineEmits<{ pick: [lo: number, hi: number] }>()

const bounds = computed(() => {
  const mins = props.products
    .map(p => (p as any).min_age_years as number | null)
    .filter((n): n is number => n != null)
  const maxs = props.products
    .map(p => (p as any).max_age_years as number | null)
    .filter((n): n is number => n != null)
  const lo = mins.length ? Math.min(...mins) : 1
  const hi = Math.max(maxs.length ? Math.max(...maxs) : 16, lo + 1)
  return { lo, hi }
})

const cards = computed(() =>
  BRAND_AGE_CARDS.map((card) => {
    const count = props.products.filter(p => matchesAge(p, card.lo, card.hi, bounds.value)).length
    return {
      ...card,
      count,
      countLabel: `${count} ${pluralRu(count, 'набор', 'набора', 'наборов')}`,
    }
  }).filter(card => card.count > 0),
)
</script>

<template>
  <section v-if="cards.length > 1" class="bla">
    <div class="bla__inner">
      <div class="bla__head">
        <h2 class="bla__title">
          Наборы по возрасту
        </h2>
        <span class="bla__sub">Подскажем, что подойдёт именно вашему ребёнку</span>
      </div>

      <div class="bla__grid">
        <button
          v-for="card in cards"
          :key="card.id"
          type="button"
          class="bla__card"
          :class="`bla__card--${card.tone}`"
          @click="emit('pick', card.lo, card.hi)"
        >
          <span class="bla__glow" aria-hidden="true" />
          <span class="bla__text">
            <span class="bla__age">{{ card.age }}</span>
            <span class="bla__card-title">{{ card.title }}</span>
            <span class="bla__note">{{ card.note }}</span>
          </span>
          <span class="bla__count">
            {{ card.countLabel }}
            <Icon name="lucide:arrow-right" class="size-4" />
          </span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bla {
    padding: 34px 0;
    background: var(--background);
  }

  .bla__inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .bla__head {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 16px;
  }

  .bla__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.03em;
  }

  .bla__sub {
    color: var(--muted-foreground);
    font-size: 14.5px;
  }

  .bla__grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .bla__card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
    box-shadow: 0 4px 14px rgb(15 23 42 / 0.06);
    text-align: left;
    cursor: pointer;
    overflow: hidden;
  }

  .bla__glow {
    position: absolute;
    top: -40px;
    right: -30px;
    width: 170px;
    height: 170px;
    border-radius: 999px;
    pointer-events: none;
  }

  .bla__card--green .bla__glow {
    background: rgb(0 188 125 / 0.16);
  }

  .bla__card--blue .bla__glow {
    background: rgb(43 127 255 / 0.16);
  }

  .bla__card--pink .bla__glow {
    background: rgb(230 0 118 / 0.14);
  }

  .bla__text {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .bla__age {
    font-weight: 800;
    font-size: 30px;
    letter-spacing: -0.03em;
  }

  .bla__card--green .bla__age,
  .bla__card--green .bla__count {
    color: var(--success);
  }

  .bla__card--blue .bla__age,
  .bla__card--blue .bla__count {
    color: var(--primary);
  }

  .bla__card--pink .bla__age,
  .bla__card--pink .bla__count {
    color: #c40065;
  }

  .bla__card-title {
    color: var(--foreground);
    font-weight: 600;
    font-size: 14.5px;
  }

  .bla__note {
    color: var(--muted-foreground);
    font-size: 13.5px;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .bla__count {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: auto;
    font-weight: 700;
    font-size: 13.5px;
  }

  @media (min-width: 760px) {
    .bla {
      padding: 64px 0;
    }

    .bla__title {
      font-size: 34px;
    }

    .bla__head {
      margin-bottom: 22px;
    }

    .bla__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .bla__card {
      min-height: 210px;
      padding: 24px;
    }

    .bla__age {
      font-size: 36px;
    }
  }
}
</style>
