<script setup lang="ts">
import { useAuth } from "~/composables/auth/useAuth";

const { handleAuthGoogle } = useAuth();
</script>
<template>
  <header class="header">
    <CommonHeaderTop />
    <CommonHeaderBottom />
  </header>
</template>
