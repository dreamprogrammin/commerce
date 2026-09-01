<script setup lang="ts">
import { profilePageShell } from '@/lib/shell'

/*
 * Настоящее избранное живёт на `/profile/wishlist`. Этот маршрут остался от
 * страницы-заглушки, на которую вёл футер; сам файл держим ради ссылок,
 * сохранённых в закладках, — он только переадресует.
 */
definePageMeta({ layout: 'shell', shell: profilePageShell, redirect: '/profile/wishlist' })
</script>

<template>
  <ProfileShell>
    <div />
  </ProfileShell>
</template>
