<script setup lang="ts">
import type { ProductRow } from '@/types'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'

const props = defineProps<{
  product: ProductRow
}>()

const cartStore = useCartStore()
</script>

<template>
  <div class="border rounded-lg overflow-hidden group transition-shadow hover:shadow-lg bg-card">
    <!-- Теперь в шаблоне мы обращаемся к товару через `props.product` -->
    <NuxtLink :to="`/product/${props.product.slug}`" class="block bg-muted">
      <div class="aspect-square overflow-hidden">
        <NuxtImg
          v-if="props.product.image_url"
          :src="`${BUCKET_NAME_PRODUCT}/${props.product.image_url}`"
          :alt="props.product.name"
          format="webp"
          quality="80"
          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
          <span>Нет фото</span>
        </div>
      </div>
    </NuxtLink>

    <div class="p-4 space-y-2">
      <h3 class="font-semibold truncate h-6">
        {{ props.product.name }}
      </h3>
      <div class="flex items-baseline justify-between">
        <p class="text-lg font-bold">
          {{ props.product.price }} ₸
        </p>
        <p v-if="props.product.bonus_points_award > 0" class="text-xs text-primary">
          +{{ props.product.bonus_points_award }} бонусов
        </p>
      </div>
      <!--
        И при клике мы тоже передаем `props.product`.
        Теперь `addItem` гарантированно получит правильный объект товара.
      -->
      <Button class="w-full" @click="cartStore.addItem(props.product)">
        В корзину
      </Button>
    </div>
  </div>
</template>
