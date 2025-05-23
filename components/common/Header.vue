<script setup lang="ts">
import { useAuth } from "~/composables/auth/useAuth";

const { handleAuthGoogle } = useAuth();
</script>
<template>
  <header class="header">
    <div class="app-container">
          <CommonHeaderTop />
    <CommonHeaderBottom />
    <CommonTabBar />
    </div>
  </header>
</template>
