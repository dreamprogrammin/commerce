<script setup lang="ts">
import type { ProductRow } from '@/types'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: ProductRow
  quantity: number
}>()

const cartStore = useCartStore()

const isDrawerOpen = ref(false)

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
function updateQuantity(newQuantity: number | string | null) { // <-- Принимаем `null`
  // Если пришел `null`, считаем это как 0
  const numQuantity = Number(newQuantity ?? 0)

  if (Number.isNaN(numQuantity))
    return

  const finalQuantity = Math.min(numQuantity, maxAvailableQuantity.value)

  // `cartStore.updateQuantity` уже умеет обрабатывать 0, вызывая removeItem
  cartStore.updateQuantity(props.product.id, finalQuantity)
}
</script>

<template>
  <Drawer v-model:open="isDrawerOpen">
    <!-- Основной счетчик, который виден всегда -->
    <div class="flex items-center justify-between w-full h-10 border rounded-md">
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

      <!--
        Кнопка-триггер, которая выглядит как цифра.
        При клике на нее откроется "шторка".
      -->
      <DrawerTrigger as-child>
        <Button variant="ghost" class="flex-1 h-full text-base font-medium rounded-none">
          {{ quantity }}
        </Button>
      </DrawerTrigger>

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

    <!-- Содержимое "шторки", которое появляется при клике -->
    <DrawerContent>
      <div class="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Выберите количество</DrawerTitle>
        </DrawerHeader>
        <div class="p-4">
          <!-- Создаем прокручиваемый список с опциями -->
          <div class="max-h-60 overflow-y-auto -mx-4">
            <div class="px-4">
              <Button
                v-for="option in quantityOptions"
                :key="option"
                variant="ghost"
                class="w-full justify-center text-lg py-6"
                :class="{ 'font-bold text-primary': option === quantity }"
                @click="updateQuantity(option)"
              >
                {{ option }}
              </Button>
            </div>
          </div>
        </div>
        <DrawerFooter>
          <DrawerClose as-child>
            <Button variant="outline">
              Отмена
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
</template>
