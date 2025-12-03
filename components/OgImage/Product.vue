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
  <div class="w-full h-full relative overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600">
    <!-- Декоративные элементы -->
    <div class="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
    <div class="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

    <div class="relative h-full flex items-center p-16 gap-12">
      <!-- Левая часть: Изображение товара -->
      <div class="flex-shrink-0 w-[500px] h-[500px]">
        <div class="w-full h-full bg-white rounded-3xl shadow-2xl overflow-hidden p-8">
          <img
            v-if="image"
            :src="image"
            alt=""
            class="w-full h-full object-contain"
          >
          <div v-else class="w-full h-full flex items-center justify-center text-6xl">
            📦
          </div>
        </div>
      </div>

      <!-- Правая часть: Информация -->
      <div class="flex-1 space-y-8">
        <!-- Логотип и магазин -->
        <div class="flex items-center gap-4 mb-8">
          <div class="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30">
            <div class="text-4xl">
              🛍️
            </div>
          </div>
          <div class="text-white text-2xl font-bold">
            Ваш магазин
          </div>
        </div>

        <!-- Категория и бренд -->
        <div class="flex flex-wrap gap-3">
          <div v-if="category" class="inline-block px-5 py-2 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
            <span class="text-white/90 text-xl font-medium">{{ category }}</span>
          </div>
          <div v-if="brand" class="inline-block px-5 py-2 bg-white/10 backdrop-blur-lg rounded-xl border border-white/20">
            <span class="text-white/90 text-xl font-medium">🏷️ {{ brand }}</span>
          </div>
        </div>

        <!-- Название товара -->
        <h1 class="text-6xl font-black text-white leading-tight drop-shadow-2xl">
          {{ title }}
        </h1>

        <!-- Цена и статус -->
        <div class="flex items-center gap-6">
          <!-- Цена -->
          <div class="bg-white rounded-3xl px-10 py-6 shadow-2xl">
            <div class="text-lg text-gray-500 mb-1">
              Цена
            </div>
            <div class="text-5xl font-black text-gray-900">
              {{ price.toLocaleString() }} ₸
            </div>
          </div>

          <!-- Статус наличия -->
          <div
            class="flex items-center gap-3 px-8 py-6 rounded-3xl backdrop-blur-xl border-2"
            :class="inStock
              ? 'bg-green-500/20 border-green-400/50'
              : 'bg-red-500/20 border-red-400/50'"
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
        <div class="flex gap-4 pt-4">
          <div class="flex items-center gap-2 bg-white/10 backdrop-blur-lg rounded-2xl px-6 py-3 border border-white/20">
            <div class="text-2xl">
              ⚡
            </div>
            <span class="text-white text-lg font-semibold">Быстрая доставка</span>
          </div>
          <div class="flex items-center gap-2 bg-white/10 backdrop-blur-lg rounded-2xl px-6 py-3 border border-white/20">
            <div class="text-2xl">
              ✨
            </div>
            <span class="text-white text-lg font-semibold">Гарантия качества</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
