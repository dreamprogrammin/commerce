<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

definePageMeta({
  layout: 'blank',
})

useHead({
  title: 'Поиск товаров',
})

const searchSuggestions = [
  { text: 'sluban', type: 'history' },
  { text: 'мягкие игрушки', type: 'history' },
  { text: 'Подгузники-трусики', type: 'suggestion' },
  { text: 'Футболка для мальчика', type: 'suggestion' },
  { text: 'конструктор LEGO', type: 'suggestion' },
]

const router = useRouter()
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    searchInput.value?.focus()
  })
})

function goBack() {
  router.back()
}

function performSearch() {
  if (searchQuery.value.trim()) {
    router.push(`/catalog/all?q=${encodeURIComponent(searchQuery.value.trim())}`)
  }
}

function selectSuggestion(suggestion: string) {
  searchQuery.value = suggestion
  performSearch()
}
</script>

<template>
  <!-- Убрали fixed, теперь страница ведет себя как обычная -->
  <div class="min-h-screen flex flex-col bg-white dark:bg-gray-900">
    <!-- Sticky header вместо fixed -->
    <header class="sticky top-0 z-10 flex-shrink-0 flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <Button
        variant="ghost"
        size="icon"
        class="rounded-full h-10 w-10 shrink-0"
        aria-label="Вернуться назад"
        @click="goBack"
      >
        <Icon name="lucide:arrow-left" class="w-5 h-5" />
      </Button>

      <div class="relative w-full">
        <Input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          placeholder="Поиск по товарам"
          class="h-10 rounded-lg text-base border-2 focus:border-primary"
          @keydown.enter="performSearch"
        />
      </div>
    </header>

    <main class="flex-1">
      <ul>
        <li
          v-for="(item, index) in searchSuggestions"
          :key="index"
          class="flex items-center gap-4 px-4 py-3 text-base text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
          @click="selectSuggestion(item.text)"
        >
          <Icon
            :name="item.type === 'history' ? 'lucide:history' : 'lucide:search'"
            class="w-5 h-5 text-gray-400 shrink-0"
          />
          <span class="flex-1 truncate">{{ item.text }}</span>
        </li>
      </ul>
    </main>
  </div>
</template>
