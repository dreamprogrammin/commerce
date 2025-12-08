<script setup lang="ts">
defineProps<{
  title: string
  price: number
  image?: string
  brand?: string
  category?: string
  inStock: boolean
}>()
</script>

<template>
  <div class="w-full h-full flex items-center p-16" style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);">
    <!-- Левая часть: Изображение товара -->
    <div class="flex-shrink-0 w-[500px] h-[500px] mr-12">
      <div class="w-full h-full bg-white rounded-3xl p-8" style="box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
        <img
          v-if="image"
          :src="image"
          alt=""
          class="w-full h-full"
          style="object-fit: contain;"
        >
        <div v-else class="w-full h-full flex items-center justify-center text-8xl">
          📦
        </div>
      </div>
    </div>

    <!-- Правая часть: Информация -->
    <div class="flex-1 flex flex-col" style="gap: 32px;">
      <!-- Логотип и магазин -->
      <div class="flex items-center" style="gap: 16px; margin-bottom: 32px;">
        <div class="w-16 h-16 rounded-2xl bg-white flex items-center justify-center" style="opacity: 0.3;">
          <div class="text-4xl">
            🛍️
          </div>
        </div>
        <div class="text-white text-2xl font-bold">
          Ваш магазин
        </div>
      </div>

      <!-- Категория и бренд -->
      <div v-if="category || brand" class="flex" style="gap: 12px; flex-wrap: wrap;">
        <div v-if="category" class="px-5 py-2 bg-white rounded-xl" style="opacity: 0.2; border: 2px solid rgba(255, 255, 255, 0.3);">
          <span class="text-white text-xl font-medium">{{ category }}</span>
        </div>
        <div v-if="brand" class="px-5 py-2 bg-white rounded-xl" style="opacity: 0.2; border: 2px solid rgba(255, 255, 255, 0.3);">
          <span class="text-white text-xl font-medium">🏷️ {{ brand }}</span>
        </div>
      </div>

      <!-- Название товара -->
      <h1 class="text-6xl font-black text-white leading-tight">
        {{ title }}
      </h1>

      <!-- Цена и статус -->
      <div class="flex items-center" style="gap: 24px;">
        <!-- Цена -->
        <div class="bg-white rounded-3xl px-10 py-6" style="box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
          <div class="text-lg text-gray-500 mb-1">
            Цена
          </div>
          <div class="text-5xl font-black text-gray-900">
            {{ price.toLocaleString() }} ₸
          </div>
        </div>

        <!-- Статус наличия -->
        <div
          class="flex items-center px-8 py-6 rounded-3xl"
          :style="{
            backgroundColor: inStock ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            border: inStock ? '2px solid rgba(34, 197, 94, 0.5)' : '2px solid rgba(239, 68, 68, 0.5)',
            gap: '12px',
          }"
        >
          <div class="text-4xl">
            {{ inStock ? '✓' : '✗' }}
          </div>
          <div class="text-white text-2xl font-bold">
            {{ inStock ? 'В наличии' : 'Нет в наличии' }}
          </div>
        </div>
      </div>

      <!-- Преимущества -->
      <div class="flex" style="gap: 16px; padding-top: 16px;">
        <div class="flex items-center bg-white rounded-2xl px-6 py-3" style="gap: 8px; opacity: 0.2; border: 2px solid rgba(255, 255, 255, 0.3);">
          <div class="text-2xl">
            ⚡
          </div>
          <span class="text-white text-lg font-semibold">Быстрая доставка</span>
        </div>
        <div class="flex items-center bg-white rounded-2xl px-6 py-3" style="gap: 8px; opacity: 0.2; border: 2px solid rgba(255, 255, 255, 0.3);">
          <div class="text-2xl">
            ✨
          </div>
          <span class="text-white text-lg font-semibold">Гарантия качества</span>
        </div>
      </div>
    </div>
  </div>
</template>
