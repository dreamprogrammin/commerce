<script setup lang="ts">
/**
 * Подразделы раздела — обычными ссылками, в серверной разметке.
 *
 * Зачем, если сверху есть чипы подразделов. Те чипы — кнопки-ФИЛЬТР: они
 * сужают выдачу этой же страницы (`?subcategories=…`) и никуда не ведут. Для
 * поиска это значит, что с «Кукол» нет ни одной ссылки на «Куклы L.O.L», а с
 * «Машинок» — на «Радиоуправляемые машинки»: проверено 22 сентября 2026 по
 * серверной разметке боя — 0 из 4 и 0 из 5. Подразделы держались только на
 * карте сайта и хлебных крошках карточек.
 *
 * Фильтр не трогаем — это привычное поведение для покупателя. Ссылки идут
 * отдельным блоком ниже товаров, и только на подразделы с товарами: вести с
 * раздела на пустую страницу «Скоро здесь появятся товары» незачем.
 */
defineProps<{
  categoryName: string
  links: { name: string, path: string, count: number }[]
}>()
</script>

<template>
  <nav
    v-if="links.length > 0"
    class="mt-10 pt-6 border-t border-border"
    :aria-label="`Подразделы: ${categoryName}`"
  >
    <h2 class="text-lg md:text-xl font-bold mb-3">
      Подразделы
    </h2>
    <div class="flex flex-wrap gap-2 md:gap-2.5">
      <NuxtLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground"
      >
        {{ link.name }}
        <span class="text-xs text-muted-foreground">{{ link.count }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>
