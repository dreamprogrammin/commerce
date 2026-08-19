<script setup lang="ts">
import type { Database } from '@/types'
import {
  HOME_DELIVERY_TILE,
  HOME_DISCOUNT_TILE_FALLBACK,
} from '@/constants/homePlaceholders'

/**
 * Плитки выгод в блоке «Акции и бонусы» (Homepage.dc.html: benefit tiles).
 *
 * Скидочная плитка НЕ хардкодит цифру: тянет максимальный процент из активных
 * promo_campaigns (таблица публично читаема). Нет активных кампаний → фолбэк
 * без конкретной цифры. Плитка доставки — из выверенной по оферте константы
 * (см. comment в constants/homePlaceholders.ts: «1–3 дня», не «1–2»).
 */
const supabase = useSupabaseClient<Database>()

const { data: topCampaign } = await useAsyncData(
  'home-top-discount',
  async () => {
    const { data, error } = await supabase
      .from('promo_campaigns')
      .select('slug, title, discount_percentage')
      .eq('is_active', true)
      .order('discount_percentage', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('❌ Не удалось загрузить акции:', error)
      return null
    }
    return data
  },
  { server: false, lazy: true, default: () => null },
)

const discountTile = computed(() => {
  const c = topCampaign.value
  if (c && c.discount_percentage) {
    return {
      id: 'discounts',
      title: `Скидки до −${c.discount_percentage}%`,
      subtitle: c.title || 'на хиты недели и распродажу',
      icon: 'lucide:badge-percent',
      href: `/promo/${c.slug}`,
      accent: 'orange' as const,
    }
  }
  return HOME_DISCOUNT_TILE_FALLBACK
})

const deliveryTile = HOME_DELIVERY_TILE
</script>

<template>
  <div class="tiles">
    <NuxtLink :to="discountTile.href" class="tile tile--orange">
      <span class="tile__icon tile__icon--orange">
        <Icon :name="discountTile.icon" class="size-[26px] text-white" />
      </span>
      <div class="tile__text">
        <b class="tile__title tile__title--orange">{{ discountTile.title }}</b>
        <span class="tile__sub tile__sub--orange">{{ discountTile.subtitle }}</span>
      </div>
    </NuxtLink>

    <NuxtLink :to="deliveryTile.href" class="tile tile--blue">
      <span class="tile__icon tile__icon--blue">
        <Icon :name="deliveryTile.icon" class="size-[26px] text-white" />
      </span>
      <div class="tile__text">
        <b class="tile__title tile__title--blue">{{ deliveryTile.title }}</b>
        <span class="tile__sub tile__sub--blue">{{ deliveryTile.subtitle }}</span>
      </div>
    </NuxtLink>
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
  .tiles {
    display: flex;
    flex-direction: column;
    gap: clamp(14px, 1.6vw, 20px);
  }

  .tile {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    border-radius: 20px;
    padding: 22px;
    text-decoration: none;
    transition: transform 0.12s ease;
  }

  .tile:hover {
    transform: translateY(-2px);
  }

  .tile--orange {
    background: linear-gradient(140deg, #fff6ec, #ffe6cc);
    border: 1px solid #ffd9b0;
  }

  .tile--blue {
    background: var(--brand-surface);
    border: 1px solid var(--color-blue-200);
  }

  .tile__icon {
    width: 52px;
    height: 52px;
    border-radius: 15px;
    display: grid;
    place-content: center;
    flex: none;
  }

  .tile__icon--orange {
    background: var(--color-orange-600);
    box-shadow: 0 8px 18px -8px rgb(234 120 20 / 0.8);
  }

  .tile__icon--blue {
    background: var(--primary);
    box-shadow: 0 8px 18px -8px rgb(43 127 255 / 0.8);
  }

  .tile__title {
    display: block;
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.02em;
  }

  .tile__title--orange {
    color: var(--color-orange-600);
  }

  .tile__title--blue {
    color: var(--primary);
  }

  .tile__sub {
    font-weight: 500;
    font-size: 13.5px;
    line-height: 1.4;
  }

  .tile__sub--orange {
    color: #8a5a1f;
  }

  .tile__sub--blue {
    color: var(--muted-foreground);
  }
}
</style>
