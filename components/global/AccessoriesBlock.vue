<script setup lang="ts">
import type { AccessoryProduct } from '@/types'

const props = defineProps<{
  accessories: AccessoryProduct[]
  loading?: boolean
}>()

const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })

// Category configuration with explicit Tailwind classes
const categories = {
  'batteries': { title: 'Батарейки', icon: 'mdi:battery', bg: 'bg-amber-50', text: 'text-amber-600' },
  'gift-wrapping': { title: 'Упаковка', icon: 'mdi:gift', bg: 'bg-pink-50', text: 'text-pink-600' },
  'other': { title: 'Аксессуары', icon: 'lucide:package', bg: 'bg-blue-50', text: 'text-blue-600' },
} as const

type CategoryKey = keyof typeof categories

// Group accessories by category
const groupedAccessories = computed(() => {
  const groups: Record<CategoryKey, AccessoryProduct[]> = {
    'batteries': [],
    'gift-wrapping': [],
    'other': [],
  }

  for (const acc of props.accessories) {
    const slug = acc.categories?.slug
    if (slug === 'batteries')
      groups.batteries.push(acc)
    else if (slug === 'gift-wrapping')
      groups['gift-wrapping'].push(acc)
    else groups.other.push(acc)
  }

  return groups
})

// Available categories (non-empty)
const availableCategories = computed(() =>
  (Object.keys(categories) as CategoryKey[]).filter(key => groupedAccessories.value[key].length > 0),
)

// Selected count per category
const selectedCount = computed(() => {
  const counts: Record<CategoryKey, number> = { 'batteries': 0, 'gift-wrapping': 0, 'other': 0 }
  for (const key of Object.keys(counts) as CategoryKey[]) {
    counts[key] = groupedAccessories.value[key].filter(acc => selectedIds.value.includes(acc.id)).length
  }
  return counts
})

// Modal/Drawer state
const isMobile = ref(false)
const isOpen = ref(false)
const activeCategory = ref<CategoryKey | null>(null)

const currentConfig = computed(() => activeCategory.value ? categories[activeCategory.value] : null)
const currentAccessories = computed(() => activeCategory.value ? groupedAccessories.value[activeCategory.value] : [])

onMounted(() => {
  isMobile.value = window.innerWidth < 1024
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 1024 })
})

function openCategory(key: CategoryKey) {
  activeCategory.value = key
  isOpen.value = true
}

function toggleAccessory(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx === -1)
    selectedIds.value = [...selectedIds.value, id]
  else selectedIds.value = selectedIds.value.filter(i => i !== id)
}

function close() {
  isOpen.value = false
  activeCategory.value = null
}
</script>

<template>
  <div v-if="loading || accessories.length > 0" class="bg-white rounded-xl p-4 shadow-sm border mt-4">
    <h3 class="font-bold text-base mb-3 flex items-center gap-2">
      <Icon name="lucide:plus-circle" class="w-4 h-4 text-primary" />
      С этим покупают
    </h3>

    <!-- Skeleton -->
    <div v-if="loading" class="grid grid-cols-3 gap-2">
      <div v-for="i in 3" :key="i" class="flex flex-col items-center p-3 rounded-lg border animate-pulse">
        <div class="w-10 h-10 bg-muted rounded-full mb-2" />
        <div class="h-3 bg-muted rounded w-14" />
      </div>
    </div>

    <!-- Category buttons -->
    <div v-else class="grid grid-cols-3 gap-2">
      <button
        v-for="key in availableCategories"
        :key="key"
        class="relative flex flex-col items-center p-3 rounded-lg border transition-all active:scale-95"
        :class="selectedCount[key] > 0 ? 'border-primary bg-primary/5' : 'hover:border-primary/50'"
        @click="openCategory(key)"
      >
        <Badge
          v-if="selectedCount[key] > 0"
          class="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 flex items-center justify-center text-xs"
        >
          {{ selectedCount[key] }}
        </Badge>
        <div class="w-10 h-10 rounded-full flex items-center justify-center mb-1.5" :class="categories[key].bg">
          <Icon :name="categories[key].icon" class="w-5 h-5" :class="categories[key].text" />
        </div>
        <span class="text-xs font-medium text-center leading-tight">{{ categories[key].title }}</span>
        <span class="text-[10px] text-muted-foreground">{{ groupedAccessories[key].length }} шт</span>
      </button>
    </div>

    <!-- Desktop Modal -->
    <Dialog v-if="!isMobile" v-model:open="isOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle v-if="currentConfig" class="flex items-center gap-2">
            <Icon :name="currentConfig.icon" class="w-5 h-5" :class="currentConfig.text" />
            {{ currentConfig.title }}
          </DialogTitle>
          <DialogDescription>Выберите товары для заказа</DialogDescription>
        </DialogHeader>
        <AccessoriesCarousel
          :accessories="currentAccessories"
          :selected-ids="selectedIds"
          @toggle="toggleAccessory"
          @close="close"
        />
      </DialogContent>
    </Dialog>

    <!-- Mobile Drawer -->
    <Drawer v-else v-model:open="isOpen">
      <DrawerContent class="max-h-[65vh]">
        <DrawerHeader class="text-left pb-2">
          <DrawerTitle v-if="currentConfig" class="flex items-center gap-2 text-base">
            <Icon :name="currentConfig.icon" class="w-5 h-5" :class="currentConfig.text" />
            {{ currentConfig.title }}
          </DrawerTitle>
        </DrawerHeader>
        <div class="px-4 pb-4 overflow-y-auto">
          <AccessoriesCarousel
            :accessories="currentAccessories"
            :selected-ids="selectedIds"
            @toggle="toggleAccessory"
            @close="close"
          />
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
