<script setup lang="ts">
const sortBy = defineModel<string>('sortBy', { required: true })

const sortOptions = [
  { value: 'popularity', label: 'Популярные', icon: 'lucide:trending-up' },
  { value: 'newest', label: 'По новизне', icon: 'lucide:sparkles' },
  { value: 'price_asc', label: 'Цена: по возрастанию', icon: 'lucide:arrow-up-narrow-wide' },
  { value: 'price_desc', label: 'Цена: по убыванию', icon: 'lucide:arrow-down-wide-narrow' },
]

const isOpen = ref(false)

// Проверяем, активна ли не-дефолтная сортировка
const isActive = computed(() => sortBy.value !== 'popularity')

// Получаем иконку текущей сортировки
const currentIcon = computed(() => {
  const option = sortOptions.find(opt => opt.value === sortBy.value)
  return option?.icon || 'lucide:arrow-up-down'
})

function selectSort(value: string) {
  sortBy.value = value
  isOpen.value = false
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        :variant="isActive ? 'default' : 'outline'"
        class="h-11 w-11 p-0 shrink-0 transition-colors" :class="[
          isActive
            ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
            : 'hover:bg-blue-500 hover:text-white hover:border-blue-500',
        ]"
      >
        <Icon :name="currentIcon" class="w-5 h-5" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-2" align="end">
      <div class="space-y-1">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent"
          :class="{
            'bg-accent': sortBy === option.value,
          }"
          @click="selectSort(option.value)"
        >
          <Icon :name="option.icon" class="w-4 h-4 shrink-0" />
          <span class="flex-1 text-left">{{ option.label }}</span>
          <Icon
            v-if="sortBy === option.value"
            name="lucide:check"
            class="w-4 h-4 text-primary"
          />
        </button>
      </div>
    </PopoverContent>
  </Popover>
</template>
