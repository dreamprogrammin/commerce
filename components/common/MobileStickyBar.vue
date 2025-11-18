<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import CommonAppSearchButtonMobile from '@/components/common/AppSearchButtonMobile.vue'
import CommonAppTabBarMobile from '@/components/common/AppTabBarMobile.vue'

const isVisible = ref(false)
let lastScrollY = 0

function handleScroll() {
  const currentScrollY = window.scrollY
  if (currentScrollY > lastScrollY && currentScrollY > 250) {
    isVisible.value = true
  }
  else if (currentScrollY < lastScrollY || currentScrollY <= 250) {
    isVisible.value = false
  }
  lastScrollY = currentScrollY < 0 ? 0 : currentScrollY
}

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})

const route = useRoute()
const MobileComponentToShow = computed(() => {
  const layout = route.meta.layout as string | undefined
  if (layout === 'profile' || layout === 'checkout' || layout === 'blank' || layout === 'catalog') {
    return null
  }
  if (route.path === '/') {
    return CommonAppTabBarMobile
  }
  return CommonAppSearchButtonMobile
})
</script>

<template>
  <div class="block lg:hidden">
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div v-if="isVisible && MobileComponentToShow" class="fixed bottom-4 left-4 right-4 z-40">
        <component :is="MobileComponentToShow" />
      </div>
    </Transition>
  </div>
</template>
