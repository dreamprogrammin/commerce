<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

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

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
  else {
    searchQuery.value = ''
  }
})

function close() {
  emit('update:isOpen', false)
}

function performSearch() {
  if (searchQuery.value.trim()) {
    router.push(`/catalog/all?q=${encodeURIComponent(searchQuery.value.trim())}`)
    close()
  }
}

function selectSuggestion(suggestion: string) {
  searchQuery.value = suggestion
  performSearch()
}
</script>

<template>
  <Sheet :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <SheetContent
      side="top"
      class="h-[100dvh] p-0 flex flex-col border-0 bg-white"
    >
      <!-- Header -->
      <div class="flex-shrink-0 p-4 bg-white border-b">
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            class="rounded-full h-10 w-10 shrink-0 hover:bg-gray-100 transition-colors"
            @click="close"
          >
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </Button>

          <div class="flex-1 relative">
            <Icon
              name="lucide:search"
              class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500/60 pointer-events-none z-10"
            />
            <Input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              placeholder="Поиск по товарам..."
              class="h-11 pl-11 pr-4 text-base bg-blue-500/5 border-blue-500/20 focus-visible:bg-blue-500/10 focus-visible:border-blue-500/30 focus-visible:ring-blue-500/20 rounded-xl transition-colors"
              @keydown.enter="performSearch"
              @keydown.esc="close"
            />
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto bg-white">
        <div class="p-3">
          <div class="space-y-1">
            <button
              v-for="(item, index) in searchSuggestions"
              :key="index"
              type="button"
              class="w-full flex items-center gap-4 px-4 py-3.5 text-base rounded-xl hover:bg-blue-50/80 active:bg-blue-100/80 transition-all duration-200 text-left group"
              @click="selectSuggestion(item.text)"
            >
              <div
                class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
                :class="item.type === 'history' ? 'bg-gray-100 group-hover:bg-blue-100/80' : 'bg-blue-50/80 group-hover:bg-blue-100/80'"
              >
                <Icon
                  :name="item.type === 'history' ? 'lucide:history' : 'lucide:search'"
                  class="w-5 h-5 transition-colors"
                  :class="item.type === 'history' ? 'text-gray-600 group-hover:text-blue-600' : 'text-blue-500'"
                />
              </div>
              <span class="flex-1 truncate text-gray-700 group-hover:text-gray-900 font-medium">
                {{ item.text }}
              </span>
              <Icon
                name="lucide:arrow-up-left"
                class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </button>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
