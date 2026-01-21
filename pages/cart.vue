<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { carouselContainerVariants } from '@/lib/variants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice, formatPriceWithDiscount } from '@/utils/formatPrice'

const cartStore = useCartStore()
const { items, subtotal, totalItems } = storeToRefs(cartStore)
const { getPublicUrl } = useSupabaseStorage()

// Хелпер для получения первого изображения товара
function getProductImage(item: typeof items.value[0]) {
  const firstImage = item.product.product_images?.[0]
  return firstImage?.image_url || null
}

// Хелпер для получения blur placeholder
function getProductBlur(item: typeof items.value[0]) {
  const firstImage = item.product.product_images?.[0]
  return firstImage?.blur_placeholder || undefined
}

// Хелпер для расчета финальной цены товара с учетом скидки
function getItemPrice(item: typeof items.value[0]) {
  const priceData = formatPriceWithDiscount(
    Number(item.product.price),
    item.product.discount_percentage,
  )
  return priceData
}

// Хелпер для расчета общей цены за товар (цена * количество)
function getItemTotal(item: typeof items.value[0]) {
  const priceData = getItemPrice(item)
  return priceData.finalNumber * item.quantity
}

const containerClass = carouselContainerVariants({ contained: 'always' })
</script>

<template>
  <div :class="`${containerClass} py-6 sm:py-12`">
    <h1 class="text-2xl sm:text-3xl font-bold mb-4 sm:mb-8">
      Ваша корзина
    </h1>

    <div v-if="items.length === 0" class="text-center text-muted-foreground py-12 sm:py-20 border-2 border-dashed rounded-lg">
      <p class="text-base sm:text-lg">
        Здесь пока пусто
      </p>
      <NuxtLink to="/catalog/boys">
        <Button class="mt-4">
          Начать покупки
        </Button>
      </NuxtLink>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 items-start">
      <!-- Список товаров -->
      <div class="lg:col-span-2 space-y-3 sm:space-y-4">
        <div
          v-for="item in items"
          :key="item.product.id"
          class="border rounded-lg bg-card overflow-hidden"
        >
          <!-- Мобильная версия -->
          <div class="sm:hidden">
            <div class="flex gap-3 p-3">
              <!-- Изображение -->
              <div class="w-20 h-20 bg-muted rounded-md overflow-hidden flex-shrink-0">
                <ProgressiveImage
                  v-if="getProductImage(item)"
                  :src="getPublicUrl('product-images', getProductImage(item)!) || ''"
                  :alt="item.product.name"
                  :placeholder="getProductBlur(item)"
                  class="w-full h-full object-cover"
                  width="80"
                  height="80"
                  loading="lazy"
                  edger
                />
                <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  Нет фото
                </div>
              </div>

              <!-- Информация -->
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-sm line-clamp-2 mb-1">
                  {{ item.product.name }}
                </h3>
                <div class="flex items-center gap-2 mb-2">
                  <p class="text-sm font-medium">
                    {{ formatPrice(getItemPrice(item).finalNumber) }} ₸ / шт.
                  </p>
                  <p v-if="getItemPrice(item).hasDiscount" class="text-xs text-muted-foreground line-through">
                    {{ formatPrice(Number(item.product.price)) }} ₸
                  </p>
                </div>
                <p class="font-bold text-base">
                  {{ formatPrice(getItemTotal(item)) }} ₸
                </p>
              </div>
            </div>

            <!-- Управление количеством -->
            <div class="flex items-center justify-between gap-2 px-3 pb-3 border-t pt-3 bg-muted/30">
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8"
                  @click="cartStore.updateQuantity(item.product.id, Math.max(1, item.quantity - 1))"
                >
                  <Icon name="lucide:minus" class="h-3 w-3" />
                </Button>
                <span class="font-semibold text-sm min-w-[2rem] text-center">{{ item.quantity }}</span>
                <Button
                  variant="outline"
                  size="icon"
                  class="h-8 w-8"
                  @click="cartStore.updateQuantity(item.product.id, item.quantity + 1)"
                >
                  <Icon name="lucide:plus" class="h-3 w-3" />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive"
                @click="cartStore.removeItem(item.product.id)"
              >
                <Trash2 class="h-4 w-4 mr-1" />
                Удалить
              </Button>
            </div>
          </div>

          <!-- Десктопная версия -->
          <div class="hidden sm:flex items-center gap-4 p-4">
            <!-- Изображение товара -->
            <div class="w-24 h-24 bg-muted rounded-md overflow-hidden flex-shrink-0">
              <ProgressiveImage
                v-if="getProductImage(item)"
                :src="getPublicUrl('product-images', getProductImage(item)!) || ''"
                :alt="item.product.name"
                :placeholder="getProductBlur(item)"
                class="w-full h-full object-cover"
                width="96"
                height="96"
                loading="lazy"
                edger
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                Нет фото
              </div>
            </div>

            <!-- Информация о товаре -->
            <div class="flex-grow">
              <h3 class="font-semibold">
                {{ item.product.name }}
              </h3>
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium">
                  {{ formatPrice(getItemPrice(item).finalNumber) }} ₸ / шт.
                </p>
                <p v-if="getItemPrice(item).hasDiscount" class="text-xs text-muted-foreground line-through">
                  {{ formatPrice(Number(item.product.price)) }} ₸
                </p>
              </div>
            </div>

            <!-- Управление количеством и ценой -->
            <div class="flex items-center gap-4">
              <Input
                type="number"
                :model-value="item.quantity"
                min="1"
                class="w-20 text-center"
                @update:model-value="val => cartStore.updateQuantity(item.product.id, Number(val))"
              />
              <p class="font-bold w-24 text-right">
                {{ formatPrice(getItemTotal(item)) }} ₸
              </p>
              <Button
                variant="ghost"
                size="icon"
                @click="cartStore.removeItem(item.product.id)"
              >
                <Trash2 class="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Итоги и кнопка оформления -->
      <aside class="lg:col-span-1 lg:sticky lg:top-24 bg-card border rounded-lg p-4 sm:p-6 space-y-3 sm:space-y-4">
        <h2 class="text-xl sm:text-2xl font-semibold">
          Итого
        </h2>
        <div class="flex justify-between text-sm sm:text-base text-muted-foreground">
          <span>{{ totalItems }} товар(а) на сумму:</span>
          <span>{{ formatPrice(subtotal) }} ₸</span>
        </div>
        <div class="flex justify-between font-bold text-lg sm:text-xl pt-3 sm:pt-4 border-t">
          <span>К оплате:</span>
          <span>{{ formatPrice(subtotal) }} ₸</span>
        </div>
        <NuxtLink to="/checkout" class="w-full">
          <Button size="lg" class="w-full">
            Перейти к оформлению
          </Button>
        </NuxtLink>
      </aside>
    </div>
  </div>
</template>
