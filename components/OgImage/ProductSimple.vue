<script setup lang="ts">
const props = defineProps<{
  title: string
  price: number
  image: string
  inStock: boolean
}>()

// Форматируем цену (Intl.NumberFormat надежнее в node среде)
const formattedPrice = new Intl.NumberFormat('ru-RU').format(props.price)
</script>

<template>
  <!--
    Важно:
    1. Используем style для background-image (Satori это любит больше, чем img absolute).
    2. width и height должны быть 100%.
    3. display: flex обязателен для родителя.
  -->
  <div
    class="w-full h-full flex flex-col justify-end bg-white"
    :style="{
      backgroundImage: `url('${image}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }"
  >
    <!-- Затемнение (градиент лучше делать через absolute div внутри flex контейнера) -->
    <div
      class="absolute inset-0"
      style="background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);"
    />

    <!-- Контент -->
    <div class="relative w-full p-16 flex flex-col items-start text-white z-10">
      <h1 class="text-6xl font-bold mb-4 leading-tight">
        {{ title }}
      </h1>

      <div class="flex items-center gap-6">
        <span class="text-4xl font-bold text-white">
          {{ formattedPrice }} ₸
        </span>

        <div
          class="flex items-center px-4 py-2 rounded-lg border-2"
          :class="inStock ? 'border-green-400 text-green-400' : 'border-red-400 text-red-400'"
        >
          <span class="text-3xl font-bold">
            {{ inStock ? '✓ В наличии' : '✗ Нет в наличии' }}
          </span>
        </div>
      </div>

      <div class="mt-8 text-2xl opacity-80 font-medium">
        Ваш магазин
      </div>
    </div>
  </div>
</template>
