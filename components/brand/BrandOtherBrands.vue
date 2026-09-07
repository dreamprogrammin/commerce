<script setup lang="ts">
/**
 * Рельс «Другие бренды». Порт секции OTHER BRANDS из `Бренд.dc.html`.
 *
 * Это не украшение, а внутренняя перелинковка: с бренд-страницы уходят
 * ссылки на соседние бренды, и робот обходит их по ней. По данным Search
 * Console бренд-страницы дают половину верхней выдачи сайта — им есть ради
 * чего связываться друг с другом.
 *
 * Ссылки настоящие, а не кнопки: в макете это `<button>` с обработчиком, но
 * там прототип. Робот по кнопке не пойдёт, и весь смысл перелинковки
 * пропал бы.
 */
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'

/*
 * Свой тип, а не `SimpleBrand` из `@/types`: тот собран как
 * `Pick<…, 'id' | 'name' | 'slug'>` и логотипа не содержит, а рельс без
 * логотипов бессмыслен.
 */
interface BrandTile {
  name: string
  slug: string
  logo_url: string | null
}

const props = defineProps<{
  brands?: BrandTile[] | null
  /** Текущий бренд — его из списка убираем. */
  currentSlug: string
}>()

const { getVariantUrl } = useSupabaseStorage()

const items = computed(() =>
  (props.brands ?? [])
    .filter(b => b.slug !== props.currentSlug && b.logo_url)
    .slice(0, 12)
    .map(b => ({
      ...b,
      logo: getVariantUrl(BUCKET_NAME_BRANDS, b.logo_url!, 'sm'),
    })),
)
</script>

<template>
  <section v-if="items.length" class="bob">
    <div class="bob__head">
      <h2 class="bob__title">
        Другие бренды
      </h2>
      <NuxtLink to="/brands" class="bob__all">
        Все бренды
        <Icon name="lucide:arrow-right" class="size-4" />
      </NuxtLink>
    </div>

    <div class="bob__rail">
      <NuxtLink
        v-for="item in items"
        :key="item.slug"
        :to="`/brand/${item.slug}`"
        class="bob__tile"
        :title="item.name"
      >
        <img
          v-if="item.logo"
          :src="item.logo"
          :alt="item.name"
          class="bob__logo"
          loading="lazy"
          decoding="async"
        >
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bob__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .bob__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.025em;
  }

  .bob__all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--primary);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
  }

  .bob__rail {
    display: flex;
    gap: 12px;
    padding: 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .bob__rail::-webkit-scrollbar {
    display: none;
  }

  .bob__tile {
    display: grid;
    flex: none;
    place-content: center;
    width: 150px;
    height: 104px;
    padding: 16px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 20px;
    background: linear-gradient(150deg, #fff, rgb(247 249 252 / 0.9));
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(15 23 42 / 0.06);
    transition:
      transform 0.14s ease,
      box-shadow 0.14s ease;
  }

  .bob__tile:hover {
    transform: translateY(-3px);
    box-shadow:
      inset 0 1px 0 #fff,
      0 12px 26px rgb(15 23 42 / 0.12);
  }

  .bob__logo {
    max-width: 100%;
    max-height: 64px;
    object-fit: contain;
  }

  @media (min-width: 900px) {
    .bob__title {
      font-size: 30px;
    }
  }
}
</style>
