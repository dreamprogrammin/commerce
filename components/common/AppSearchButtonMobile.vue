<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const isVisible = ref(true)
let lastScrollY = 0
let ticking = false

function handleScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY

      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        isVisible.value = true
      }
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
    enter-active-class="transition-transform duration-300"
    enter-from-class="-translate-y-full"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-300"
    leave-from-class="translate-y-0"
    leave-to-class="-translate-y-full"
  >
    <div
      v-show="isVisible"
      class="w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg p-2 rounded-xl border shadow-lg"
    >
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
    </div>
  </Transition>
</template>
