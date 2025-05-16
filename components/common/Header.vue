<script setup lang="ts">
import { useAuth } from "~/composables/auth/useAuth";

const { handleAuthGoogle } = useAuth();
</script>
<template>
  <header class="header">

    <div class="wrapper">
      <div>
        <nuxt-link to="/">Logo</nuxt-link>
      </div>

      <div>
        <nuxt-link to="/profile">Профиль</nuxt-link>
        <button>Корзина</button>
        <button>Кешбэк</button>
      </div>
    </div>
  </header>
</template>
<style>
header .wrapper {
  display: flex;
  justify-content: space-between;
  padding: 0 15px;
  max-width: 1350px;
}
</style>
