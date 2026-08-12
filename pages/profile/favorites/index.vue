<script setup lang="ts">
/*
 * Настоящее избранное живёт на `/profile/wishlist`. Этот маршрут остался от
 * страницы-заглушки, на которую вёл футер; сам файл держим ради ссылок,
 * сохранённых в закладках, — он только переадресует.
 */
definePageMeta({
  redirect: '/profile/wishlist',
})
</script>

<template>
  <div />
</template>
