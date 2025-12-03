<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  categoryImage?: string
  productsCount?: number
}>()
</script>

<template>
  <div class="w-full h-full relative overflow-hidden">
    <!-- Градиентный фон -->
    <div class="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600" />

    <!-- Картинка категории как фон (если есть) -->
    <div v-if="categoryImage" class="absolute inset-0">
      <img
        :src="categoryImage"
        alt=""
        class="w-full h-full object-cover opacity-20 blur-sm"
      >
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/80 via-blue-600/80 to-purple-600/80" />
    </div>

    <!-- Декоративные элементы -->
    <div class="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl" />
    <div class="absolute bottom-0 left-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

    <!-- Основной контент -->
    <div class="relative h-full flex flex-col justify-between p-16">
      <!-- Верхняя часть: Логотип + название магазина -->
      <div class="flex items-center gap-6">
        <div class="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-2xl">
          <div class="text-5xl">
            🛍️
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-white text-3xl font-bold tracking-tight">
            Ваш магазин
          </div>
          <div class="text-white/70 text-xl font-medium">
            Интернет-магазин
          </div>
        </div>
      </div>

      <!-- Центральная часть: Заголовок -->
      <div class="space-y-6 max-w-4xl">
        <div class="inline-block px-6 py-3 bg-white/10 backdrop-blur-lg rounded-2xl border border-white/20">
          <span class="text-white/90 text-2xl font-semibold">Каталог</span>
        </div>
        <h1 class="text-8xl font-black text-white leading-tight drop-shadow-2xl">
          {{ title }}
        </h1>
        <p v-if="description" class="text-3xl text-white/90 font-medium leading-relaxed">
          {{ description }}
        </p>
      </div>

      <!-- Нижняя часть: Статистика -->
      <div class="flex items-center gap-6">
        <!-- Количество товаров -->
        <div
          v-if="productsCount && productsCount > 0"
          class="flex items-center gap-4 bg-white/10 backdrop-blur-xl rounded-3xl px-8 py-5 border border-white/20 shadow-2xl"
        >
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <div class="text-4xl">
              📦
            </div>
          </div>
          <div class="text-white">
            <div class="text-xl opacity-90 font-medium">
              Товаров в наличии
            </div>
            <div class="text-4xl font-black">
              {{ productsCount }}+
            </div>
          </div>
        </div>

        <!-- Доставка -->
        <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl rounded-3xl px-8 py-5 border border-white/20 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <div class="text-4xl">
              ⚡
            </div>
          </div>
          <div class="text-white">
            <div class="text-xl opacity-90 font-medium">
              Быстрая доставка
            </div>
            <div class="text-2xl font-bold">
              По всему Казахстану
            </div>
          </div>
        </div>

        <!-- Гарантия качества -->
        <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl rounded-3xl px-8 py-5 border border-white/20 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <div class="text-4xl">
              ✨
            </div>
          </div>
          <div class="text-white">
            <div class="text-xl opacity-90 font-medium">
              Гарантия
            </div>
            <div class="text-2xl font-bold">
              100%
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
