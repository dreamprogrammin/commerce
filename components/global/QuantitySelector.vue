<script setup lang="ts">
import type { ProductRow } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: ProductRow
  quantity: number
}>()
const isOpen = ref(false)
const cartStore = useCartStore()

const isDesktop = useMediaQuery('(min-width: 768px)')
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
function updateQuantity(newQuantity: number | string) {
  const numQuantity = Number(newQuantity)
  if (Number.isNaN(numQuantity))
    return
  const finalQuantity = Math.min(numQuantity, maxAvailableQuantity.value)
  if (finalQuantity > 0) {
    cartStore.updateQuantity(props.product.id, finalQuantity)
  }
  else {
    cartStore.removeItem(props.product.id)
  }
  isOpen.value = false // Закрываем окно после выбора
}
</script>

<template>
  <!-- Если десктоп - рендерим Dialog -->
  <Dialog v-if="isDesktop" v-model:open="isOpen">
    <DialogTrigger as-child>
      <div class="flex items-center justify-between w-full h-10 p-1 rounded-full bg-muted cursor-pointer">
        <Button variant="ghost" size="icon" class="h-8 w-8 rounded-full" :disabled="quantity <= 1" @click.stop="updateQuantity(quantity - 1)">
          -
        </Button>
        <span class="flex-1 text-base font-medium text-center rounded-lg bg-background shadow-sm">{{ quantity }}</span>
        <Button variant="ghost" size="icon" class="h-8 w-8 rounded-full" :disabled="quantity >= maxAvailableQuantity" @click.stop="updateQuantity(quantity + 1)">
          +
        </Button>
      </div>
    </DialogTrigger>
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>Выберите количество</DialogTitle>
      </DialogHeader>
      <!-- Ссылка на компонент с контентом, чтобы не дублировать код -->
      <QuantityList :options="quantityOptions" :current-quantity="quantity" @select="updateQuantity" />
    </DialogContent>
  </Dialog>

  <!-- Если мобильное устройство - рендерим Drawer -->
  <Drawer v-else v-model:open="isOpen">
    <DrawerTrigger as-child>
      <div class="flex items-center justify-between w-full h-10 p-1 rounded-full bg-muted cursor-pointer">
        <Button variant="ghost" size="icon" class="h-8 w-8 rounded-full" :disabled="quantity <= 1" @click.stop="updateQuantity(quantity - 1)">
          -
        </Button>
        <span class="flex-1 text-base font-medium text-center rounded-lg bg-background shadow-sm">{{ quantity }}</span>
        <Button variant="ghost" size="icon" class="h-8 w-8 rounded-full" :disabled="quantity >= maxAvailableQuantity" @click.stop="updateQuantity(quantity + 1)">
          +
        </Button>
      </div>
    </DrawerTrigger>
    <DrawerContent>
      <div class="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Выберите количество</DrawerTitle>
        </DrawerHeader>
        <div class="p-4 pb-0">
          <!-- Ссылка на компонент с контентом -->
          <QuantityList :options="quantityOptions" :current-quantity="quantity" @select="updateQuantity" />
        </div>
        <DrawerFooter class="pt-2">
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
