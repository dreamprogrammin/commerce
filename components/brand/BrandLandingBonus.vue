<script setup lang="ts">
/**
 * Полоса про бонусы — макет `Бренд LEGO v2.dc.html`.
 *
 * Цифры считаются по товарам бренда: доля бонусов от цены и сколько вернётся
 * за флагманский набор. В макете было «до 10%», по данным выходит 5%.
 */
import type { ProductWithGallery } from '@/types'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  brandName: string
  products: ProductWithGallery[]
}>()

const share = computed(() => {
  const shares = props.products
    .map((p) => {
      const price = p.final_price ?? p.price
      const bonus = p.bonus_points_award ?? 0
      return price > 0 ? (bonus / price) * 100 : 0
    })
    .filter(value => value > 0)
  return shares.length ? Math.round(Math.max(...shares)) : 0
})

/** Набор с самым большим начислением — он и стоит примером. */
const best = computed(() => {
  const sorted = [...props.products].sort(
    (a, b) => (b.bonus_points_award ?? 0) - (a.bonus_points_award ?? 0),
  )
  const top = sorted[0]
  return top && (top.bonus_points_award ?? 0) > 0 ? top : null
})
</script>

<template>
  <section v-if="share > 0" class="blo">
    <div class="blo__inner">
      <span class="blo__icon">
        <Icon name="lucide:coins" class="size-[27px]" />
      </span>
      <div class="blo__text">
        <span class="blo__title">Бонусы за каждый набор {{ brandName }}</span>
        <span class="blo__note">
          Возвращаем до {{ share }}% бонусами: 1 бонус = 1 ₸.
          <template v-if="best">
            За набор «{{ best.name }}» вернём
            {{ formatPrice(best.bonus_points_award ?? 0) }} бонусов.
          </template>
        </span>
      </div>
      <NuxtLink to="/profile/bonuses" class="blo__cta">
        Как это работает
        <Icon name="lucide:arrow-right" class="size-[17px]" />
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blo {
    padding: 0 0 34px;
    background: var(--background);
  }

  .blo__inner {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px var(--page-gutter);
    border: 1px solid var(--bonus-border);
    border-radius: 22px;
    background: linear-gradient(120deg, var(--bonus-surface), var(--background));
  }

  .blo__icon {
    display: grid;
    flex: none;
    place-content: center;
    width: 56px;
    height: 56px;
    border-radius: 17px;
    background: var(--bonus-surface-2);
    color: var(--bonus);
  }

  .blo__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .blo__title {
    color: var(--foreground);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.02em;
  }

  .blo__note {
    max-width: 56ch;
    color: var(--muted-foreground);
    font-size: 14.5px;
    line-height: 1.55;
    text-wrap: pretty;
  }

  .blo__cta {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 9px;
    height: 50px;
    padding: 0 22px;
    border-radius: 999px;
    background: var(--bonus);
    color: #fff;
    font-weight: 700;
    font-size: 15px;
  }

  .blo__cta:hover {
    color: #fff;
    filter: brightness(0.94);
  }

  @media (min-width: 760px) {
    .blo {
      padding: 0 0 64px;
    }

    .blo__inner {
      flex-direction: row;
      align-items: center;
      gap: 20px;
      padding: 26px var(--page-gutter);
    }

    .blo__title {
      font-size: 26px;
    }
  }
}
</style>
