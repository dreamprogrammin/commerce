<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  ariaLabel?: string
  glass?: boolean
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
  <div class="relative w-full group/search">
    <Search
      class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none transition-colors group-focus-within/search:text-primary/70"
      aria-hidden="true"
    />
    <input
      ref="inputRef"
      v-model="model"
      type="search"
      :placeholder="placeholder ?? 'Поиск коллекции...'"
      :aria-label="ariaLabel ?? 'Поиск по коллекциям'"
      autocomplete="off"
      :class="[
        'w-full h-8 pl-8 pr-7 text-xs rounded-lg outline-none transition-all duration-200',
        glass
          ? 'bg-white/30 backdrop-blur-sm border border-white/40 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_1px_3px_rgba(0,0,0,0.06)] placeholder:text-muted-foreground/50 focus:bg-white/50 focus:border-white/60 focus:shadow-[inset_0_1px_3px_rgba(255,255,255,0.5),0_0_0_3px_rgba(var(--primary),0.08)]'
          : 'bg-transparent border border-input placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 focus:ring-[3px]',
      ]"
    >
    <button
      v-if="model"
      type="button"
      aria-label="Очистить поиск"
      class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-black/5 transition-all duration-150"
      @click="clear"
    >
      <X class="w-3 h-3" />
    </button>
  </div>
</template>
