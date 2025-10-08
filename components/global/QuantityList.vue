<script setup lang="ts">
defineProps<{
  options: number[]
  currentQuantity: number
}>()

const emit = defineEmits<{
  (e: 'select', value: number): void
}>()
</script>

<template>
  <div class="max-h-60 overflow-y-auto -mx-4 custom-scrollbar">
    <div class="px-4">
      <!-- Кнопка "Удалить", как в примере -->
      <Button
        variant="ghost"
        class="w-full justify-center text-lg py-6 text-destructive hover:text-destructive"
        @click="emit('select', 0)"
      >
        Удалить
      </Button>
      <!-- Список опций -->
      <Button
        v-for="option in options"
        :key="option"
        variant="ghost"
        class="w-full justify-center text-lg py-6"
        :class="{ 'font-bold text-primary bg-muted': option === currentQuantity }"
        @click="emit('select', option)"
      >
        {{ option }}
      </Button>
    </div>
  </div>
</template>
