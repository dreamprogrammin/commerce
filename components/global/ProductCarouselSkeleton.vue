<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
    <div v-for="n in 4" :key="n" class="border rounded-lg overflow-hidden bg-card">
      <Skeleton class="w-full aspect-square" />

      <div class="p-4 space-y-3">
        <Skeleton class="h-5 w-3/4" />

        <div class="flex items-baseline justify-between">
          <Skeleton class="h-6 w-1/3" />
          <Skeleton class="h-4 w-1/4" />
        </div>

        <Skeleton class="h-10 w-full" />
      </div>
    </div>
  </div>
</template>
