<script setup lang="ts">
const user = useSupabaseUser();
</script>
<template>
  <div>
    <h1>Домашняя Страница</h1>

    <div v-if="user">
      Добро пожаловать {{ user.email }}!
      <nuxt-link to="/dashboard">Пройти в рабочую страницу</nuxt-link>
    </div>

    <div v-else>
      Пожалуйста пройдите<nuxt-link to="/login">войдите в систему.</nuxt-link>
    </div>
  </div>
</template>
