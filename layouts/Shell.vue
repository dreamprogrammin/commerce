<script setup lang="ts">
/**
 * Единая оболочка страницы: шапка, содержимое, подвал.
 *
 * Зачем один макет вместо трёх. В `app.vue` `NuxtPage` лежит ВНУТРИ
 * `NuxtLayout`, поэтому при смене макета страница уничтожается вместе с ним —
 * и удержание (`keepalive`) не включается в принципе. Пока главная жила на
 * `Home.vue`, а каталог на `Catalog.vue`, любой переход между ними пересобирал
 * дерево заново. Замер 31 августа: занятость потока при возврате на главную
 * 847 мс, с общим макетом и удержанием — 183 мс.
 *
 * Различия страниц вынесены в `meta.shell`, а не в отдельные макеты:
 *
 *   header       'overlay'   прозрачная поверх героя, стекло при скролле
 *                'default'   обычная липкая
 *                'static'    обычная, но не липкая
 *   mobileHeader 'catalog'   липкий таббар категорий на узком экране
 *                'none'      ничего (главная: её роль играет герой)
 *   footer       'layered'   в собственном слое поверх фиксированного героя
 *                'plain'     обычный
 *                'none'      без подвала
 *   padTop       отступ сверху у <main> на узком экране, px
 *   padBottom    резерв под нижнюю навигацию у <main> на узком экране
 *
 * Значения по умолчанию повторяют прежний `CatalogListing.vue` — самый
 * обычный случай.
 */
import { catalogShell } from '@/lib/shell'

// Подвал грузим лениво — он внизу страницы, не нужен при первом рендере.
const LazyCommonFooter = defineAsyncComponent(() => import('@/components/common/Footer.vue'))

const route = useRoute()

const shell = computed(() => {
  const m = route.meta.shell
  if (m)
    return { ...catalogShell, ...m }
  // Страница ничего не объявила — ведём себя как прежний CatalogListing.
  return catalogShell
})

const headerVariant = computed<'overlay' | 'solid'>(() => (shell.value.header === 'overlay' ? 'overlay' : 'solid'))
const headerSticky = computed(() => shell.value.header !== 'static')
</script>

<template>
  <div class="flex flex-col" :class="shell.surface ? 'bg-[var(--page-surface)]' : ''" style="min-height: 100dvh">
    <!-- Шапка только на десктопе. На узком экране её роль играет либо герой
         (главная), либо собственный таббар страницы. -->
    <div v-if="shell.header !== 'none'" :class="shell.headerOnMobile ? '' : 'hidden lg:block'">
      <CommonSiteHeader :variant="headerVariant" :sticky="headerSticky" />
    </div>

    <!-- Мобильный таббар категорий: только у /catalog. -->
    <div v-if="shell.mobileHeader === 'catalog'" class="lg:hidden sticky top-0 z-40">
      <CommonCatalogMobileHeader />
    </div>

    <!-- Общий мобильный таббар: страницы без собственного заголовка. -->
    <div v-else-if="shell.mobileHeader === 'app'" class="lg:hidden">
      <CommonAppTabBarMobile />
    </div>

    <!-- Обвязка флоу оформления: шаги и локейшн-панель. Отдельным
         компонентом, чтобы оболочка не знала про заказы. -->
    <OrderCheckoutChrome v-if="shell.chrome === 'checkout'" />

    <!-- `<main>` рисуется всегда: условная обёртка меняет положение страницы
         в дереве, и Vue пересоздаёт её при каждом переходе — удержание тогда
         молча не работает. -->
    <main
      :class="[
        shell.grow ? 'flex-1' : '',
        shell.padTop === 76 ? 'pt-[76px] lg:pt-0' : '',
        shell.padTop === 56 ? 'pt-[56px] lg:pt-0' : '',
        shell.padBottom ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0' : '',
      ]"
    >
      <slot />
    </main>

    <!-- Подвал в собственном слое нужен только там, где под ним лежит
         фиксированный герой (главная): иначе он рисуется ПОД ним и герой
         просвечивает сквозь полупрозрачный фон. Резерв под нижнюю навигацию
         висит здесь же, а не на <main>: на <main> он давал прозрачную полосу
         между листом контента и подвалом, сквозь которую светил герой. -->
    <div
      v-if="shell.footer === 'layered'"
      class="home-footer-layer mt-auto pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"
    >
      <LazyCommonFooter />
    </div>
    <LazyCommonFooter v-else-if="shell.footer === 'plain'" />
  </div>
</template>

<style scoped>
/* Стиль намеренно лежит в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты Tailwind
   живут в @layer utilities. Бесслойное правило бьёт слой независимо от
   специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .home-footer-layer {
    position: relative;
    /* Строго между фиксированным героем (z-index: 0) и листом контента
       `.home-content` (z-index: 6). Ставить 6 нельзя: при равном z-index
       побеждает тот, кто ниже в DOM, а подвал идёт после <main> — он начинал
       перекрывать липкую строку поиска. */
    z-index: 1;
    background: var(--background);
  }
}
</style>
