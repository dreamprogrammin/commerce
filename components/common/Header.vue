<script setup lang="ts">
import { useAuth } from '~/composables/auth/useAuth';

const {handleAuthGoogle} = useAuth()
</script>
<template>
      <header class="header">
    <div>
      <div>
        <nuxt-link to="/">Logo</nuxt-link>
      </div>

      <nuxt-link to="/profile">Профиль</nuxt-link>
      <button>Корзина</button>
      <button>Кешбэк</button>
    </div>
  </header>
</template>