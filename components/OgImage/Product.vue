<script setup lang="ts">
const props = defineProps<{
  title: string
  price: number
  imageUrl?: string
  category?: string
  inStock: boolean
}>()

// Форматируем цену красиво
const formattedPrice = computed(() => {
  return new Intl.NumberFormat('ru-RU').format(Math.round(props.price || 0))
})
</script>

<template>
  <!--
    ИСПОЛЬЗУЕМ STYLE ВМЕСТО КЛАССОВ TAILWIND
    Это гарантирует, что Satori не упадет.
  -->
  <div
    style="
      width: 100%;
      height: 100%;
      display: flex;
      background-image: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      color: white;
      font-family: 'Inter', sans-serif;
    "
  >
    <!-- Левая часть: Картинка товара -->
    <div
      style="
        width: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 64px;
      "
    >
      <div
        style="
          background-color: white;
          border-radius: 24px;
          padding: 32px;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        "
      >
        <img
          v-if="imageUrl"
          :src="imageUrl"
          width="400"
          height="400"
          style="
            width: 100%;
            height: 100%;
            object-fit: contain;
          "
        >
        <!-- Смайлик, если картинки нет -->
        <div v-else style="font-size: 80px;">
          📦
        </div>
      </div>
    </div>

    <!-- Правая часть: Информация -->
    <div
      style="
        width: 50%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 64px;
      "
    >
      <!-- Верх: Логотип/название магазина -->
      <div style="display: flex; flex-direction: column;">
        <div style="font-size: 30px; font-weight: 700; margin-bottom: 8px;">
          Ваш Магазин
        </div>
        <div v-if="category" style="font-size: 20px; opacity: 0.9;">
          {{ category }}
        </div>
      </div>

      <!-- Середина: Название товара -->
      <div style="display: flex; align-items: center; flex-grow: 1;">
        <h1
          style="
            font-size: 48px;
            font-weight: 800;
            line-height: 1.1;
            /* Satori не поддерживает line-clamp, поэтому просто обрезаем overflow если что */
            overflow: hidden;
            max-height: 200px;
          "
        >
          {{ title }}
        </h1>
      </div>

      <!-- Низ: Цена и статус -->
      <div style="display: flex; flex-direction: column;">
        <div style="font-size: 60px; font-weight: 900; margin-bottom: 16px;">
          {{ formattedPrice }} ₸
        </div>

        <div style="display: flex; align-items: center;">
          <div
            :style="{
              backgroundColor: inStock ? '#22c55e' : '#ef4444',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontSize: '20px',
              fontWeight: 600,
              color: 'white',
            }"
          >
            {{ inStock ? '✓ В наличии' : '✗ Нет в наличии' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
