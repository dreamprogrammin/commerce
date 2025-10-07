<script setup lang="ts">
import type { ProductRow } from '@/types'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: ProductRow
  quantity: number
}>()

const cartStore = useCartStore()

/**
 * Вычисляет максимальное количество товара, доступное для заказа (80% от остатка).
 * Минимум - 1.
 */
const maxAvailableQuantity = computed(() => {
  const stock = props.product.stock_quantity || 0
  // Считаем 80% и округляем вниз
  const available = Math.floor(stock * 0.8)
  // Гарантируем, что доступно хотя бы 1, если на складе что-то есть
  return Math.max(1, available)
})

/**
 * Генерирует массив чисел от 1 до `maxAvailableQuantity` для опций в Select.
 */
const quantityOptions = computed(() => {
  // Array.from создает массив, а `(_, i) => i + 1` заполняет его числами от 1 до N
  return Array.from({ length: maxAvailableQuantity.value }, (_, i) => i + 1)
})

/**
 * Универсальная функция для обновления количества.
 * @param newQuantity - Новое количество. Может быть строкой из Select или числом из кнопок.
 */
function updateQuantity(newQuantity: number | string | null) {
  const numQuantity = Number(newQuantity)
  if (Number.isNaN(numQuantity))
    return

  const finalQuantity = Math.min(numQuantity, maxAvailableQuantity.value)

  // В вашем сторе функция называется `updateQuantity`, а не `updateItemQuantity`
  cartStore.updateQuantity(props.product.id, finalQuantity)
}
</script>

<template>
  <div class-="flex items-center justify-between w-full h-10 border rounded-md">
    <!-- Кнопка "Минус" -->
    <Button
      variant="ghost"
      size="icon"
      class="h-full rounded-r-none"
      :disabled="quantity <= 1"
      @click="updateQuantity(quantity - 1)"
    >
      -
    </Button>

    <!-- "Сердце" компонента: Select, который выглядит как текст -->
    <Select :model-value="String(quantity)" @update:model-value="updateQuantity">
      <SelectTrigger class="flex-1 h-full border-y-0 border-x rounded-none focus:ring-0 focus:ring-offset-0">
        <SelectValue placeholder="Кол-во" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="option in quantityOptions"
          :key="option"
          :value="String(option)"
        >
          {{ option }} шт.
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Кнопка "Плюс" -->
    <Button
      variant="ghost"
      size="icon"
      class="h-full rounded-l-none"
      :disabled="quantity >= maxAvailableQuantity"
      @click="updateQuantity(quantity + 1)"
    >
      +
    </Button>
  </div>
</template>
