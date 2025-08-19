<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
    <!-- Рендерим 6 карточек-заглушек -->
    <div v-for="n in 6" :key="n" class="space-y-4">
      <Skeleton class="aspect-square w-full rounded-lg" />
      <div class="space-y-2">
        <Skeleton class="h-6 w-3/4" />
        <Skeleton class="h-8 w-1/2" />
      </div>
      <Skeleton class="h-10 w-full" />
    </div>
  </div>
</template>
