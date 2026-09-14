<script setup lang="ts">
/**
 * Полоса выгод под шапкой — макет `Бренд LEGO v2.dc.html`.
 *
 * Условия магазина, а не сочинение: сроки доставки и обмена взяты из
 * опубликованных `/terms` и `/returns`, доля бонусов считается по товарам
 * бренда. В макете стояли «1–2 дня» и «до 10%» — и то, и другое расходится
 * с тем, что магазин обещает и начисляет на самом деле.
 */
const props = defineProps<{
  /** Наибольшая доля бонусов от цены среди товаров бренда, в процентах. */
  bonusShare?: number
}>()

const items = computed(() => [
  {
    icon: 'lucide:shield-check',
    title: 'Только оригинал',
    note: 'Сертификаты на каждый набор',
    tint: 'rgb(0 188 125 / 0.12)',
    color: '#007a55',
  },
  {
    icon: 'lucide:truck',
    title: 'Доставка 1–3 дня',
    note: 'Алматы, по Казахстану 3–7 дней',
    tint: 'rgb(43 127 255 / 0.12)',
    color: 'var(--primary)',
  },
  {
    icon: 'lucide:gift',
    title: 'Бонусы 1 = 1 ₸',
    note: props.bonusShare
      ? `Возвращаем до ${props.bonusShare}% с покупки`
      : 'Возвращаем бонусами с покупки',
    tint: 'var(--bonus-surface)',
    color: 'var(--bonus)',
  },
  {
    icon: 'lucide:package-check',
    title: 'Обмен 14 дней',
    note: 'Если набор не подошёл',
    tint: 'rgb(230 0 118 / 0.1)',
    color: '#c40065',
  },
])
</script>

<template>
  <section class="blb">
    <div class="blb__inner">
      <span v-for="item in items" :key="item.title" class="blb__item">
        <span class="blb__icon" :style="{ background: item.tint, color: item.color }">
          <Icon :name="item.icon" class="size-[21px]" />
        </span>
        <span class="blb__text">
          <span class="blb__title">{{ item.title }}</span>
          <span class="blb__note">{{ item.note }}</span>
        </span>
      </span>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blb {
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
    background: var(--page-surface, #f7f9fc);
  }

  .blb__inner {
    display: grid;
    grid-template-columns: 1fr;
    gap: 14px;
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blb__item {
    display: flex;
    align-items: center;
    gap: 13px;
    min-width: 0;
  }

  .blb__icon {
    display: grid;
    flex: none;
    place-content: center;
    width: 44px;
    height: 44px;
    border-radius: 13px;
  }

  .blb__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .blb__title {
    color: var(--foreground);
    font-weight: 700;
    font-size: 14px;
  }

  .blb__note {
    color: var(--muted-foreground);
    font-size: 12.5px;
  }

  @media (min-width: 760px) {
    .blb {
      padding: 22px 0;
    }

    .blb__inner {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
  }

  @media (min-width: 1200px) {
    .blb__inner {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
}
</style>
