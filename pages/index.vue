<script setup lang="ts">
import { useProfileStore } from '@/stores/profile'

const user = useSupabaseUser()
const profileStore = useProfileStore()
</script>

<template>
  <h1>Добро пожаловать в наш магазин</h1>
  <ClientOnly>
    <div v-if="user">
      <nuxt-link to="/admin">
        Пройти на рабочею страницу
      </nuxt-link>
    </div>

    <div v-else>
      <nuxt-link to="/login">
        Пожалуйста авторизуйтесь
      </nuxt-link>
    </div>
    <template #fallback>
      <div>Загрузка...</div>
    </template>

    <CommonAppCarousel />

    <HomePopularCategories />
    <div>
      <HomeBonusProgramCard />
    </div>
  </ClientOnly>
</template>
