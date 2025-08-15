<script setup lang="ts">
import type { ProductRow } from '@/types'
// --- 1. Импорты ---
// Импортируем UI-компонент кнопки
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCartStore } from '@/stores/publicStore/cartStore'
// Импортируем наш composable для получения URL изображений из Storage
// Импортируем стор корзины, чтобы кнопка "В корзину" работала

// --- 2. Типы и пропсы ---
// Определяем тип для одного товара, чтобы TypeScript нам помогал
// `defineProps` объявляет, что этот компонент ожидает получить "на вход"
// один обязательный пропс `product` с типом `Product`.
defineProps<{
  product: ProductRow
}>()

// --- 3. Инициализация ---
// Создаем экземпляр стора корзины
const cartStore = useCartStore()
// Создаем экземпляр composable для работы со Storage
const { getPublicUrl } = useSupabaseStorage()
// Определяем имя бакета, где лежат картинки товаров
const BUCKET_NAME = 'product-images'
</script>

<template>
  <!--
    `group` - это специальный класс Tailwind, который позволяет стилизовать
    дочерние элементы при наведении на этот родительский div.
    `transition-shadow` и `hover:shadow-lg` добавляют красивый эффект тени при наведении.
  -->
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card">
    <!--
      Вся верхняя часть карточки (картинка) - это ссылка на детальную страницу товара.
      Путь к странице формируется динамически с использованием `product.slug`.
    -->
    <NuxtLink :to="`/product/${product.slug}`" class="block bg-muted">
      <!--
        `aspect-square` делает блок квадратным. `overflow-hidden` обрезает все, что выходит за рамки.
      -->
      <div class="aspect-square overflow-hidden">
        <!-- Условие `v-if`: показываем картинку, только если `image_url` существует в данных. -->
        <img
          v-if="product.image_url"
          :src="getPublicUrl(BUCKET_NAME, product.image_url) || undefined"
          :alt="product.name"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        >
        <!--
          Блок `v-else` (заглушка) показывается, если `image_url` отсутствует.
        -->
        <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
          <span>Нет фото</span>
        </div>
      </div>
    </NuxtLink>

    <!-- Нижняя часть карточки с информацией и кнопкой -->
    <div class="p-4 space-y-2">
      <!--
        `truncate` - класс Tailwind, который обрезает длинный текст и ставит '...'.
        `h-6` задает фиксированную высоту, чтобы карточки не "прыгали", если у товаров разная длина названия.
      -->
      <h3 class="font-semibold truncate h-6">
        {{ product.name }}
      </h3>

      <div class="flex items-baseline justify-between">
        <p class="text-lg font-bold">
          {{ product.price }} ₸
        </p>
        <!-- Показываем количество начисляемых бонусов, только если оно больше нуля -->
        <p v-if="product.bonus_points_award > 0" class="text-xs text-primary">
          +{{ product.bonus_points_award }} бонусов
        </p>
      </div>

      <!--
        При клике на кнопку мы вызываем метод `addItem` из `cartStore`,
        передавая ему весь объект `product`.
      -->
      <Button class="w-full" @click="cartStore.addItem(product)">
        В корзину
      </Button>
    </div>
  </div>
</template>
