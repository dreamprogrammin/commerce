<script setup lang="ts">
defineProps<{
  title: string
  subtitle: string
  description?: string
}>()
</script>

<template>
  <div class="w-full h-full relative overflow-hidden bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600">
    <!-- Декоративные элементы -->
    <div class="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
    <div class="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl" />

    <!-- Паттерн в фоне -->
    <div class="absolute inset-0 opacity-10">
      <div class="grid grid-cols-8 grid-rows-4 gap-8 p-16 h-full">
        <div v-for="i in 32" :key="i" class="bg-white/20 rounded-2xl" />
      </div>
    </div>

    <!-- Контент -->
    <div class="relative h-full flex flex-col justify-between p-16">
      <!-- Верх: Логотип -->
      <div class="flex items-center gap-6">
        <div class="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-2xl">
          <div class="text-6xl">
            🛍️
          </div>
        </div>
        <div class="space-y-2">
          <div class="text-white text-4xl font-bold tracking-tight">
            {{ title }}
          </div>
          <div class="text-white/80 text-2xl font-medium">
            {{ subtitle }}
          </div>
        </div>
      </div>

      <!-- Центр: Основное сообщение -->
      <div class="space-y-8">
        <h1 class="text-8xl font-black text-white leading-tight drop-shadow-2xl max-w-4xl">
          Детские товары
        </h1>
        <p v-if="description" class="text-4xl text-white/90 font-medium leading-relaxed max-w-3xl">
          {{ description }}
        </p>
      </div>

      <!-- Низ: Преимущества -->
      <div class="flex items-center gap-6">
        <!-- Быстрая доставка -->
        <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl rounded-3xl px-8 py-5 border border-white/20 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <div class="text-4xl">
              ⚡
            </div>
          </div>
          <div class="text-white">
            <div class="text-xl opacity-90 font-medium">
              Быстрая
            </div>
            <div class="text-3xl font-black">
              Доставка
            </div>
          </div>
        </div>

        <!-- Гарантия -->
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
            <div class="text-3xl font-black">
              Качества
            </div>
          </div>
        </div>

        <!-- Бонусы -->
        <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl rounded-3xl px-8 py-5 border border-white/20 shadow-2xl">
          <div class="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
            <div class="text-4xl">
              🎁
            </div>
          </div>
          <div class="text-white">
            <div class="text-xl opacity-90 font-medium">
              Бонусная
            </div>
            <div class="text-3xl font-black">
              Программа
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
