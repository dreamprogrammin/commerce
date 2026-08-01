import type { MaybeRefOrGetter } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

/**
 * Логика «в избранное» без разметки.
 *
 * `components/product/WishlistButton.vue` рендерит shadcn `Button` с жёстко
 * заданными `h-8 w-8 rounded-full` — переопределять их снаружи классом значит
 * драться со специфичностью утилит. Поэтому у карточки товара свои кнопки
 * (мобильная пилюля-шапка и кнопка в блоке покупки), а общая часть — здесь.
 */
export function useProductWishlist(
  productId: MaybeRefOrGetter<string | undefined>,
  productName: MaybeRefOrGetter<string | undefined>,
) {
  const wishlistStore = useWishlistStore()
  const authStore = useAuthStore()
  const modalStore = useModalStore()

  const isWishlisted = computed(() => {
    const id = toValue(productId)
    return !!id && wishlistStore.isProductInWishlist(id)
  })

  async function toggleWishlist() {
    const id = toValue(productId)
    if (!id)
      return
    if (!authStore.isLoggedIn) {
      modalStore.openLoginModal()
      return
    }
    await wishlistStore.toggleWishlist(id, toValue(productName) ?? '')
  }

  return { isWishlisted, toggleWishlist }
}
