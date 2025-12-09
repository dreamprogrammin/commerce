<script setup lang="ts">
const props = defineProps<{
  title: string
  price: number
  imageUrl?: string
  category?: string
  inStock: boolean
}>()

// Форматируем цену.
// Если price не придет, будет 0.
const formattedPrice = computed(() => {
  return new Intl.NumberFormat('ru-RU').format(Math.round(props.price || 0))
})
</script>

<template>
  <!--
    Стили Satori:
    1. font-family должен совпадать с тем, что в конфиге (Inter).
    2. Всегда используем display: flex для контейнеров.
  -->
  <div
    style="
      width: 100%;
      height: 100%;
      display: flex;
      background-image: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      font-family: 'Inter', sans-serif;
      color: white;
    "
  >
    <!-- Левая колонка: Изображение -->
    <div
      style="
        width: 50%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 60px;
      "
    >
      <div
        style="
          display: flex;
          width: 100%;
          height: 100%;
          background-color: white;
          border-radius: 30px;
          align-items: center;
          justify-content: center;
          box-shadow: 0 20px 50px rgba(0,0,0,0.3);
          overflow: hidden;
        "
      >
        <!--
           Важно для картинки:
           Если URL нет или он битый, покажем эмодзи.
           Для img обязательно указывать object-fit в style.
        -->
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
        <div v-else style="font-size: 100px;">
          📦
        </div>
      </div>
    </div>

    <!-- Правая колонка: Текст -->
    <div
      style="
        width: 50%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding-right: 60px;
      "
    >
      <!-- Категория / Магазин -->
      <div style="display: flex; font-size: 24px; opacity: 0.8; margin-bottom: 20px;">
        {{ category || 'Магазин' }}
      </div>

      <!-- Название товара -->
      <div
        style="
          display: flex;
          font-size: 48px;
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 40px;
          text-shadow: 0 2px 10px rgba(0,0,0,0.2);
        "
      >
        {{ title || 'Название товара' }}
      </div>

      <!-- Цена -->
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="font-size: 64px; font-weight: 700;">
          {{ formattedPrice }} ₸
        </div>
      </div>

      <!-- Плашка наличия -->
      <div style="display: flex; margin-top: 30px;">
        <div
          :style="{
            backgroundColor: inStock ? '#22c55e' : '#ef4444',
            padding: '10px 25px',
            borderRadius: '20px',
            fontSize: '24px',
            fontWeight: 700,
            color: 'white',
            display: 'flex',
          }"
        >
          {{ inStock ? '✓ В наличии' : '✗ Нет в наличии' }}
        </div>
      </div>
    </div>
  </div>
</template>
