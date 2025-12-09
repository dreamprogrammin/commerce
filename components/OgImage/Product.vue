<script setup lang="ts">
const props = defineProps<{
  title: string
  price: number
  imageUrl?: string
  category?: string
  inStock: boolean
}>()

// Форматируем цену
const formattedPrice = new Intl.NumberFormat('ru-RU').format(Math.round(props.price || 0))

// Предварительно рассчитываем стили
const stockBgColor = props.inStock ? '#22c55e' : '#ef4444'
const stockText = props.inStock ? '✓ В наличии' : '✗ Нет в наличии'
const displayCategory = props.category || 'Магазин'
const displayTitle = props.title || 'Название товара'
</script>

<template>
  <div
    style="
      width: 100%;
      height: 100%;
      display: flex;
      background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
      font-family: Inter;
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
        "
      >
        <img
          :src="imageUrl || 'https://via.placeholder.com/400x400/e5e7eb/9ca3af?text=No+Image'"
          width="400"
          height="400"
          style="
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 30px;
          "
        >
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
        padding: 60px;
        padding-left: 40px;
      "
    >
      <!-- Категория -->
      <div style="display: flex; font-size: 24px; opacity: 0.9; margin-bottom: 20px;">
        {{ displayCategory }}
      </div>

      <!-- Название товара -->
      <div
        style="
          display: flex;
          font-size: 48px;
          font-weight: 900;
          line-height: 1.2;
          margin-bottom: 40px;
          text-shadow: 0 2px 10px rgba(0,0,0,0.2);
        "
      >
        {{ displayTitle }}
      </div>

      <!-- Цена -->
      <div style="display: flex; align-items: baseline; margin-bottom: 30px;">
        <div style="display: flex; font-size: 64px; font-weight: 700;">
          {{ formattedPrice }} ₸
        </div>
      </div>

      <!-- Плашка наличия -->
      <div style="display: flex;">
        <div
          :style="`
            background-color: ${stockBgColor};
            padding: 12px 28px;
            border-radius: 20px;
            font-size: 24px;
            font-weight: 700;
            color: white;
            display: flex;
          `"
        >
          {{ stockText }}
        </div>
      </div>
    </div>
  </div>
</template>
