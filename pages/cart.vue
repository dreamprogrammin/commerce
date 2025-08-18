<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCartStore } from '@/stores/publicStore/cartStore'

const cartStore = useCartStore()
const { items, subtotal, totalItems } = storeToRefs(cartStore)
const { getPublicUrl } = useSupabaseStorage()
</script>

<template>
  <div class="container py-12">
    <h1 class="text-3xl font-bold mb-8">
      Ваша корзина
    </h1>

    <div v-if="items.length === 0" class="text-center text-muted-foreground py-20 border-2 border-dashed rounded-lg">
      <p class="text-lg">
        Здесь пока пусто
      </p>
      <NuxtLink to="/catalog/boys">
        <Button class="mt-4">
          Начать покупки
        </Button>
      </NuxtLink>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      <!-- Список товаров -->
      <div class="lg:col-span-2 space-y-4">
        <div v-for="item in items" :key="item.product.id" class="flex items-center gap-4 border p-4 rounded-lg bg-card">
          <div class="w-24 h-24 bg-muted rounded-md overflow-hidden flex-shrink-0">
            <img v-if="item.product.image_url" :src="getPublicUrl('product-images', item.product.image_url) || undefined" :alt="item.product.name" class="w-full h-full object-cover">
          </div>
          <div class="flex-grow">
            <h3 class="font-semibold">
              {{ item.product.name }}
            </h3>
            <p class="text-sm text-muted-foreground">
              {{ item.product.price }} ₸ / шт.
            </p>
          </div>
          <div class="flex items-center gap-4">
            <Input
              type="number"
              :model-value="item.quantity"
              min="1"
              class="w-20 text-center"
              @update:model-value="val => cartStore.updateQuantity(item.product.id, Number(val))"
            />
            <p class="font-bold w-24 text-right">
              {{ Number(item.product.price) * item.quantity }} ₸
            </p>
            <Button variant="ghost" size="icon" @click="cartStore.removeItem(item.product.id)">
              <Trash2 class="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Итоги и кнопка оформления -->
      <aside class="lg:col-span-1 lg:sticky top-24 bg-card border rounded-lg p-6 space-y-4">
        <h2 class="text-2xl font-semibold">
          Итого
        </h2>
        <div class="flex justify-between text-muted-foreground">
          <span>{{ totalItems }} товар(а) на сумму:</span>
          <span>{{ subtotal }} ₸</span>
        </div>
        <div class="flex justify-between font-bold text-lg pt-4 border-t">
          <span>К оплате:</span>
          <span>{{ subtotal }} ₸</span>
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
