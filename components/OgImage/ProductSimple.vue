<script setup lang="ts">
defineProps<{
  title: string
  price: number
  image: string
  inStock: boolean
}>()
</script>

<template>
  <div class="w-full h-full relative">
    <!-- Изображение товара на фоне -->
    <img
      :src="image"
      alt=""
      class="absolute inset-0 w-full h-full object-cover"
    >

    <!-- Затемнение -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />

    <!-- Контент поверх -->
    <div class="absolute bottom-0 left-0 right-0 p-16 text-white">
      <h1 class="text-6xl font-bold mb-4">
        {{ title }}
      </h1>
      <div class="flex items-center gap-6 text-3xl">
        <span class="font-bold">{{ price.toLocaleString() }} ₸</span>
        <span v-if="inStock" class="text-green-400">✓ В наличии</span>
        <span v-else class="text-red-400">✗ Нет в наличии</span>
      </div>
      <div class="mt-6 text-xl opacity-80">
        Ваш магазин
      </div>
    </div>
  </div>
</template>
