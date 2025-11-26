<script setup lang="ts">
const sortBy = defineModel<string>('sortBy', { required: true })

const sortOptions = [
  { value: 'popularity', label: 'Популярные', icon: 'lucide:trending-up', description: 'Сначала популярные товары' },
  { value: 'newest', label: 'По новизне', icon: 'lucide:sparkles', description: 'Сначала новые поступления' },
  { value: 'price_asc', label: 'Цена: по возрастанию', icon: 'lucide:arrow-up-narrow-wide', description: 'От дешевых к дорогим' },
  { value: 'price_desc', label: 'Цена: по убыванию', icon: 'lucide:arrow-down-wide-narrow', description: 'От дорогих к дешевым' },
]

const isPopoverOpen = ref(false)
const isDrawerOpen = ref(false)

// Проверяем, активна ли не-дефолтная сортировка
const isActive = computed(() => sortBy.value !== 'popularity')

// Получаем текущую опцию сортировки
const currentOption = computed(() => {
  const option = sortOptions.find(opt => opt.value === sortBy.value)
  return option ?? sortOptions[0]
})

// Безопасные геттеры для предотвращения ошибок
const currentIcon = computed(() => currentOption.value?.icon ?? 'lucide:arrow-up-down')
const currentLabel = computed(() => currentOption.value?.label ?? 'Сортировка')

function selectSort(value: string) {
  sortBy.value = value
  isPopoverOpen.value = false
  isDrawerOpen.value = false
}
</script>

<template>
  <!-- Десктоп: Popover -->
  <Popover v-model:open="isPopoverOpen">
    <PopoverTrigger as-child>
      <Button
        :variant="isActive ? 'default' : 'outline'"
        class="h-11 gap-2 shrink-0 transition-colors hidden lg:flex"
        :class="[
          isActive
            ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
            : 'hover:bg-blue-500 hover:text-white hover:border-blue-500',
        ]"
      >
        <Icon :name="currentIcon" class="w-4 h-4" />
        <span>{{ currentLabel }}</span>
        <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-72 p-2" align="end">
      <div class="space-y-1">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-accent"
          :class="{
            'bg-accent': sortBy === option.value,
          }"
          @click="selectSort(option.value)"
        >
          <div
            class="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
            :class="sortBy === option.value ? 'bg-primary/10' : 'bg-muted'"
          >
            <Icon
              :name="option.icon"
              class="w-4 h-4"
              :class="sortBy === option.value ? 'text-primary' : 'text-muted-foreground'"
            />
          </div>
          <div class="flex-1 text-left">
            <div class="font-medium">
              {{ option.label }}
            </div>
            <div class="text-xs text-muted-foreground">
              {{ option.description }}
            </div>
          </div>
          <Icon
            v-if="sortBy === option.value"
            name="lucide:check"
            class="w-4 h-4 text-primary"
          />
        </button>
      </div>
    </PopoverContent>
  </Popover>

  <!-- Мобилка: только кнопка для открытия Drawer -->
  <Button
    :variant="isActive ? 'default' : 'outline'"
    class="h-11 w-11 p-0 shrink-0 transition-colors lg:hidden"
    :class="[
      isActive
        ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-500'
        : 'hover:bg-blue-500 hover:text-white hover:border-blue-500',
    ]"
    @click="isDrawerOpen = true"
  >
    <Icon :name="currentIcon" class="w-5 h-5" />
  </Button>

  <!-- Drawer для мобилки -->
  <Drawer v-model:open="isDrawerOpen">
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle class="flex items-center gap-2">
          <Icon name="lucide:arrow-up-down" class="w-5 h-5" />
          Сортировка товаров
        </DrawerTitle>
        <DrawerDescription>
          Выберите порядок отображения товаров
        </DrawerDescription>
      </DrawerHeader>

      <div class="px-4 pb-6 space-y-2">
        <button
          v-for="option in sortOptions"
          :key="option.value"
          type="button"
          class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
          :class="[
            sortBy === option.value
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
              : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
          ]"
          @click="selectSort(option.value)"
        >
          <div
            class="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
            :class="sortBy === option.value ? 'bg-white/20' : 'bg-background/50'"
          >
            <Icon :name="option.icon" class="w-5 h-5" />
          </div>
          <div class="flex-1 text-left">
            <div class="font-semibold text-base">
              {{ option.label }}
            </div>
            <div
              class="text-sm mt-0.5"
              :class="sortBy === option.value ? 'text-white/80' : 'text-muted-foreground'"
            >
              {{ option.description }}
            </div>
          </div>
          <Icon
            v-if="sortBy === option.value"
            name="lucide:check-circle"
            class="w-6 h-6"
          />
        </button>
      </div>

      <DrawerFooter>
        <DrawerClose as-child>
          <Button variant="outline" class="w-full">
            Закрыть
          </Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
