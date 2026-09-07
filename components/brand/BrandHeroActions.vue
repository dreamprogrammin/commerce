<script setup lang="ts">
/**
 * Кнопки в шапке бренда: «Смотреть N моделей» и «Все бренды».
 * Порт нижней части левой колонки HERO из `Бренд.dc.html`.
 *
 * Без них карточка бренда упиралась в пустоту: рядом стоит витрина товара
 * высотой 380 px, колонки растянуты по ней, а содержимого — логотип, имя и
 * пара бейджей. Кнопки заполняют низ и при этом полезны: первая уводит к
 * каталогу на той же странице, вторая — к списку брендов.
 *
 * Прокрутка к каталогу, а не переход: сетка товаров уже на этой странице,
 * и уводить с неё было бы странно. Цель ищется по id, чтобы не тащить сюда
 * ref через два уровня компонентов.
 */
const props = defineProps<{
  productCount: number
  /** id блока каталога на странице — цель прокрутки. */
  catalogId: string
}>()

/** Русское склонение: 1 модель, 2 модели, 5 моделей. */
const label = computed(() => {
  const n = props.productCount
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return `${n} модель`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return `${n} модели`
  return `${n} моделей`
})

function scrollToCatalog() {
  const el = document.getElementById(props.catalogId)
  if (!el)
    return
  // 80px — высота липкой шапки, иначе заголовок каталога уезжает под неё.
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' })
}
</script>

<template>
  <div class="bha">
    <button
      v-if="productCount > 0"
      type="button"
      class="bha__primary"
      @click="scrollToCatalog"
    >
      <Icon name="lucide:arrow-down" class="size-5" />
      Смотреть {{ label }}
    </button>

    <NuxtLink to="/brands" class="bha__ghost">
      <Icon name="lucide:layout-grid" class="size-[18px] text-primary" />
      Все бренды
    </NuxtLink>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bha {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: auto;
    padding-top: 18px;
  }

  .bha__primary,
  .bha__ghost {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    border-radius: 999px;
    font-size: 15px;
    cursor: pointer;
  }

  .bha__primary {
    padding: 0 24px;
    border: 1px solid rgb(255 255 255 / 0.45);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.9));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 10px 24px rgb(43 127 255 / 0.3);
    color: #fff;
    font-weight: 700;
  }

  .bha__primary:hover {
    background: linear-gradient(150deg, rgb(90 158 255 / 1), rgb(21 93 252 / 0.95));
  }

  .bha__ghost {
    padding: 0 22px;
    border: 1px solid rgb(255 255 255 / 0.9);
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.6));
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(15 23 42 / 0.08);
    color: var(--foreground);
    font-weight: 600;
  }

  .bha__ghost:hover {
    background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.7));
    color: var(--foreground);
  }
}
</style>
