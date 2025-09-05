<script setup lang="ts">
import type { CategoryRow } from '@/types' // Импортируем тип для категорий
import { ChevronRight } from 'lucide-vue-next'

// Компонент принимает массив `items`, каждый из которых имеет структуру CategoryRow
defineProps<{
  items: CategoryRow[]
}>()
</script>

<template>
  <!--
    `v-if` гарантирует, что мы не будем рендерить пустой контейнер,
    если "крошек" нет (например, на главной странице каталога).
  -->
  <nav v-if="items && items.length > 0" aria-label="Breadcrumb">
    <!--
      `ol` (ordered list) - семантически правильный тег для "хлебных крошек".
      `flex items-center` - выстраивает элементы в ряд.
      `text-sm text-muted-foreground` - задает стиль текста.
    -->
    <ol class="flex items-center space-x-2">
      <!--
        Всегда добавляем ссылку на главную страницу, чтобы пользователь
        мог легко вернуться в начало.
      -->
      <li>
        <NuxtLink
          to="/"
          class="hover:text-primary transition-colors"
          aria-label="Главная страница"
        >
          Главная
        </NuxtLink>
      </li>

      <!--
        Итерируем массив "крошек", который пришел в `props`.
        Для каждой "крошки" создаем элемент списка `li`.
      -->
      <li v-for="(item, index) in items" :key="item.id">
        <div class="flex items-center">
          <!-- Разделитель (иконка ">") -->
          <ChevronRight class="h-4 w-4" />

          <!--
            Условие: если это ПОСЛЕДНЯЯ "крошка" в списке,
            то это текущая страница, и она не должна быть ссылкой.
            Мы отображаем ее как простой текст.
          -->
          <span
            v-if="index === items.length - 1"
            class="ml-2 font-medium text-foreground"
            aria-current="page"
          >
            {{ item.name }}
          </span>
          <!--
            `else`: если это не последняя "крошка",
            то это ссылка на родительскую категорию.
          -->
          <NuxtLink
            v-else
            :to="item.href"
            class="ml-2 hover:text-primary transition-colors"
          >
            {{ item.name }}
          </NuxtLink>
        </div>
      </li>
    </ol>
  </nav>
</template>
