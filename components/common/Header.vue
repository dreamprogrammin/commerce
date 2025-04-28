<script setup lang="ts">
import { useAuth } from '~/composables/auth/useAuth';

const {handleAuthGoogle} = useAuth()
</script>
<template>
      <header class="header">
    <div>
      <div>LOGO</div>

      <button @click="handleAuthGoogle">Войти</button>
      <button>Корзина</button>
      <button>Кешбэк</button>
    </div>
  </header>
</template>