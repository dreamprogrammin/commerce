<script setup lang="ts">
import type { Database } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { sectionSpacingVariants } from '@/lib/variants'

/**
 * «Популярные бренды» (Homepage.dc.html: секция brands).
 *
 * Горизонтальная лента логотипов в рамках. Источник — таблица brands
 * (метрики популярности у брендов нет; алфавит + limit — существующий
 * продовый компромисс, тот же, что в BrandsCollapsible).
 */
/*
 * Двенадцать логотипов, а не двадцать.
 *
 * После переезда секции в SSR логотипы попали в критический путь: замер
 * 24 августа (390px, CPU ×4, Slow 4G) — 14 штук и 155 КБ скачиваются до
 * DOMContentLoaded при DPR 3, 20 штук и 228 КБ при DPR 2. Лента
 * горизонтальная, на 390px видно три-четыре, до двадцатого никто не
 * доскроллит.
 *
 * Карточки товаров так урезать смысла НЕТ, проверено: сколько бы их ни было
 * в разметке, до DCL успевают одни и те же пять — остальные ниже сгиба или
 * за краем карусели. Поэтому «Хиты продаж» и лента остаются как есть.
 */
const BRANDS_LIMIT = 12

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

const { data: brands } = await useAsyncData(
  'home-brands-rail',
  async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('id, name, slug, logo_url, blur_placeholder')
      .order('name')
      .limit(BRANDS_LIMIT)
    if (error) {
      console.error('❌ Не удалось загрузить бренды:', error)
      return []
    }
    return data ?? []
  },
  /*
   * Грузим на СЕРВЕРЕ и без `lazy`.
   *
   * Было `{ server: false, lazy: true }`: запрос уходил только с клиента, да
   * ещё и из-под `ClientOnly` + `requestIdleCallback` в index.vue. Замер
   * прода 24 августа (390px, CPU ×4, Slow 4G): запрос за брендами уходил на
   * 4885 мс.
   *
   * `lazy` здесь нельзя вернуть даже вместе с `server: true`: он не даёт
   * рендеру дождаться данных, разметка уедет пустой, а payload досериализуется
   * уже с брендами — ровно та гонка, из-за которой на `/` ловили
   * «Hydration completed but contains mismatches» на слайдах (см. комментарий
   * в pages/index.vue).
   */
  { default: () => [] },
)

function logoOf(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm') || null
}
</script>

<template>
  <section v-if="brands && brands.length" :class="sectionSpacingVariants({ size: 'xs' })">
    <div class="flex items-center justify-between gap-3 mb-4">
      <div class="flex flex-col gap-1">
        <h2 class="m-0 font-bold tracking-tight text-[clamp(22px,3vw,32px)]">
          Популярные бренды
        </h2>
        <p class="m-0 text-sm text-muted-foreground">
          Работаем только с проверенными производителями детских товаров
        </p>
      </div>
      <NuxtLink to="/brands" class="brands-cta brands-cta--desktop">
        Все бренды
        <Icon name="lucide:arrow-right" class="size-4" />
      </NuxtLink>
    </div>

    <div class="brands-scroll hs">
      <div class="brands-wrap">
        <NuxtLink
          v-for="brand in brands"
          :key="brand.id"
          :to="`/brand/${brand.slug}`"
          :title="brand.name"
          class="brand-card"
        >
          <img
            v-if="logoOf(brand.logo_url)"
            :src="logoOf(brand.logo_url)!"
            :alt="brand.name"
            loading="lazy"
            class="brand-card__logo"
          >
          <span v-else class="brand-card__fallback">{{ brand.name }}</span>
        </NuxtLink>
      </div>
    </div>

    <NuxtLink to="/brands" class="brands-cta brands-cta--mobile">
      Все бренды
      <Icon name="lucide:arrow-right" class="size-[17px]" />
    </NuxtLink>
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
  .brands-cta {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: none;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    text-decoration: none;
    box-shadow: var(--shadow-sm);
    transition:
      background 0.15s ease,
      transform 0.1s ease;
  }

  .brands-cta:hover {
    background: var(--brand-hover);
  }

  .brands-cta:active {
    transform: scale(0.97);
  }

  .brands-cta--desktop {
    height: 44px;
    padding: 0 20px;
  }

  .brands-cta--mobile {
    display: none;
    width: 100%;
    height: 52px;
    margin-top: 14px;
    border-radius: 14px;
    font-size: 15px;
  }

  .brands-scroll {
    overflow-x: auto;
  }

  .brands-wrap {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }

  .brand-card {
    display: grid;
    place-items: center;
    height: 132px;
    padding: 18px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--border);
    background: #fff;
    transition:
      border-color 0.15s ease,
      transform 0.12s ease;
  }

  .brand-card:hover {
    border-color: var(--color-blue-200);
    transform: translateY(-2px);
  }

  .brand-card__logo {
    max-width: 100%;
    max-height: 64px;
    object-fit: contain;
    display: block;
  }

  .brand-card__fallback {
    font-weight: 700;
    font-size: 14px;
    color: var(--foreground);
    text-align: center;
  }

  :global(.dark) .brand-card {
    background: var(--card);
  }

  @media (max-width: 1023px) {
    .brands-cta--desktop {
      display: none;
    }

    .brands-cta--mobile {
      display: inline-flex;
    }

    /* Edge-bleed: отступ строго из --page-gutter (см. assets/css/tailwind.css),
       иначе рельс не совпадает с контейнером секции. */
    .brands-scroll {
      margin-inline: calc(-1 * var(--page-gutter));
      -webkit-overflow-scrolling: touch;
    }

    .brands-wrap {
      grid-auto-flow: column;
      grid-template-columns: none;
      grid-template-rows: repeat(3, 88px);
      grid-auto-columns: 128px;
      gap: 12px;
      width: max-content;
      padding-inline: var(--page-gutter);
    }

    .brand-card {
      height: 88px;
      padding: 12px;
    }

    .brand-card__logo {
      max-height: 44px;
    }
  }
}
</style>
