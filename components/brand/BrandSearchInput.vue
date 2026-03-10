<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  ariaLabel?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

const model = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

function clear() {
  emit('update:modelValue', '')
  nextTick(() => inputRef.value?.focus())
}
</script>

<template>
  <div class="relative w-full">
    <Search
      class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
      aria-hidden="true"
    />
    <Input
      ref="inputRef"
      v-model="model"
      type="search"
      :placeholder="placeholder ?? 'Поиск коллекции...'"
      :aria-label="ariaLabel ?? 'Поиск по коллекциям'"
      autocomplete="off"
      class="pl-9 pr-8"
    />
    <button
      v-if="model"
      type="button"
      aria-label="Очистить поиск"
      class="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      @click="clear"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
