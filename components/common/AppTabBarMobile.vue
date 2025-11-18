<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { carouselContainerVariants } from '@/lib/variants'

const container = carouselContainerVariants({ contained: 'always' })
const isVisible = ref(true)
let lastScrollY = 0
let ticking = false

function handleScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY

      // Показываем таббар если:
      // 1. Скроллим вверх
      // 2. Находимся в самом верху страницы (< 100px)
      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        isVisible.value = true
      }
      // Прячем таббар если скроллим вниз и прокрутили больше 100px
      else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        isVisible.value = false
      }

      lastScrollY = currentScrollY
      ticking = false
    })

    ticking = true
  }
}

const isSearchOpen = ref(false)

function openSearch() {
  isSearchOpen.value = true
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    enter-from-class="translate-y-[-100%]"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-300 ease-in"
    leave-from-class="translate-y-0"
    leave-to-class="translate-y-[-100%]"
  >
    <div
      v-if="isVisible"
      class="fixed top-0 left-0 right-0 z-40 w-full bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg p-2 border-b border-gray-200 dark:border-gray-800 shadow-sm"
      :class="container"
    >
      <div class="flex w-full items-center gap-2">
        <!-- Кнопка "Поиск" -->
        <Button
          class="group flex-1 flex items-center justify-center gap-2 bg-white dark:bg-gray-800 h-11 rounded-lg px-4 border border-gray-200 dark:border-gray-700 hover:border-primary transition-colors"
          @click="openSearch"
        >
          <Icon name="lucide:search" class="size-5 text-gray-500 dark:text-gray-400" />
          <span class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
            Поиск
          </span>
        </Button>
        <SearchDrawer v-model:is-open="isSearchOpen" />

        <!-- Кнопка "Каталог" -->
        <NuxtLink
          to="/catalog"
          class="group flex items-center justify-center gap-2 hover:bg-primary/90 h-11 px-6 rounded-lg transition-colors bg-blue-500"
        >
          <Icon name="lucide:layout-grid" class="w-5 h-5 text-white" />
          <span class="text-sm text-white font-semibold">
            Каталог
          </span>
        </NuxtLink>
      </div>
    </div>
  </Transition>
</template>
