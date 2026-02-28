<script setup lang="ts">
import { Heart } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const props = defineProps<{
  productId: string
  productName: string
}>()

const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()

// `isProductInWishlist` - это метод-геттер из стора, который проверяет наличие по ID
const isWishlisted = computed(() => wishlistStore.isProductInWishlist(props.productId))

async function handleToggle() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }
  await wishlistStore.toggleWishlist(props.productId, props.productName)
}
</script>

<template>
  <Button
    type="button"
    size="icon"
    variant="ghost"
    class="rounded-full h-8 w-8 transition-colors"
    :class="{ 'text-red-500 hover:text-red-600': isWishlisted, 'text-muted-foreground': !isWishlisted }"
    @click.stop="handleToggle"
  >
    <Heart :fill="isWishlisted ? 'currentColor' : 'none'" class="h-5 w-5" />
  </Button>
</template>
