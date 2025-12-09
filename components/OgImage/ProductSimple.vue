<script setup lang="ts">
defineProps<{
  title: string
  price: number
  image: string
  inStock: boolean
}>()
</script>

<template>
  <div
    :style="{
      width: '1200px',
      height: '630px',
      display: 'flex',
      position: 'relative',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      overflow: 'hidden',
    }"
  >
    <!-- Изображение товара (с проверкой доступности) -->
    <div
      :style="{
        position: 'absolute',
        top: '80px',
        left: '80px',
        width: '470px',
        height: '470px',
        background: 'white',
        borderRadius: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }"
    >
      <img
        v-if="image"
        :src="image"
        alt=""
        :style="{
          maxWidth: '90%',
          maxHeight: '90%',
          objectFit: 'contain',
        }"
      >
      <div
        v-else :style="{
          fontSize: '120px',
        }"
      >
        📦
      </div>
    </div>

    <!-- Правая панель с информацией -->
    <div
      :style="{
        position: 'absolute',
        right: '0',
        top: '0',
        bottom: '0',
        width: '580px',
        padding: '80px 60px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.95)',
      }"
    >
      <!-- Название магазина -->
      <div
        :style="{
          fontSize: '24px',
          fontWeight: '600',
          color: '#667eea',
          marginBottom: '24px',
        }"
      >
        Ваш магазин
      </div>

      <!-- Название товара -->
      <h1
        :style="{
          fontSize: '48px',
          fontWeight: '800',
          color: '#1a202c',
          lineHeight: '1.2',
          marginBottom: '32px',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: '3',
          WebkitBoxOrient: 'vertical',
        }"
      >
        {{ title }}
      </h1>

      <!-- Цена -->
      <div
        :style="{
          fontSize: '56px',
          fontWeight: '900',
          color: '#667eea',
          marginBottom: '24px',
        }"
      >
        {{ price.toLocaleString() }} ₸
      </div>

      <!-- Статус наличия -->
      <div
        :style="{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 24px',
          borderRadius: '12px',
          fontSize: '24px',
          fontWeight: '600',
          background: inStock ? '#d4edda' : '#f8d7da',
          color: inStock ? '#155724' : '#721c24',
          width: 'fit-content',
        }"
      >
        <span>{{ inStock ? '✓' : '✗' }}</span>
        <span>{{ inStock ? 'В наличии' : 'Нет в наличии' }}</span>
      </div>
    </div>
  </div>
</template>
