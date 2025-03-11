<script setup lang="ts">
const user = useSupabaseUser();

const firstName = getUserMetaData(user.value, "first_name", "");
const lastName = getUserMetaData(user.value, "last_name", "");
</script>
<template>
  <div>
    <h1>Домашняя Страница</h1>

    <div v-if="user">
      Добро пожаловать <b>{{ `${firstName} ${lastName}` }}!</b>
      <nuxt-link to="/dashboard">Пройти в рабочую страницу</nuxt-link>
    </div>

    <div v-else>
      Пожалуйста пройдите<nuxt-link to="/login">войдите в систему.</nuxt-link>
    </div>
  </div>
</template>
