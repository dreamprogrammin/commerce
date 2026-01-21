<script setup lang="ts">
import type { AccessoryProduct } from '@/types'

const props = defineProps<{
  accessories: AccessoryProduct[]
  loading?: boolean
}>()

// Use defineModel for proper two-way binding
const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })

function toggleAccessory(id: string) {
  const current = [...selectedIds.value]
  const index = current.indexOf(id)
  if (index === -1) {
    current.push(id)
  }
  else {
    current.splice(index, 1)
  }
  selectedIds.value = current
}

// Count selected items per category
const selectedBatteriesCount = computed(() =>
  props.accessories.filter(acc =>
    acc.categories?.slug === 'batteries' && selectedIds.value.includes(acc.id),
  ).length,
)

const selectedGiftWrappingCount = computed(() =>
  props.accessories.filter(acc =>
    acc.categories?.slug === 'gift-wrapping' && selectedIds.value.includes(acc.id),
  ).length,
)

const selectedOtherCount = computed(() =>
  props.accessories.filter(acc =>
    acc.categories?.slug !== 'batteries'
    && acc.categories?.slug !== 'gift-wrapping'
    && selectedIds.value.includes(acc.id),
  ).length,
)

const isMobile = ref(false)
const isModalOpen = ref(false)
const isDrawerOpen = ref(false)
const selectedType = ref<'batteries' | 'gift-wrapping' | 'other' | null>(null)

onMounted(() => {
  isMobile.value = window.innerWidth < 1024
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

function handleResize() {
  isMobile.value = window.innerWidth < 1024
}

// Group accessories by category slug
const batteriesAccessories = computed(() =>
  props.accessories.filter(acc => acc.categories?.slug === 'batteries'),
)

const giftWrappingAccessories = computed(() =>
  props.accessories.filter(acc => acc.categories?.slug === 'gift-wrapping'),
)

// Accessories that don't match batteries or gift-wrapping
const otherAccessories = computed(() =>
  props.accessories.filter(acc =>
    acc.categories?.slug !== 'batteries' && acc.categories?.slug !== 'gift-wrapping',
  ),
)

const hasBatteries = computed(() => batteriesAccessories.value.length > 0)
const hasGiftWrapping = computed(() => giftWrappingAccessories.value.length > 0)
const hasOther = computed(() => otherAccessories.value.length > 0)
const hasAnyAccessories = computed(() => props.accessories.length > 0)

const currentAccessories = computed(() => {
  if (selectedType.value === 'batteries')
    return batteriesAccessories.value
  if (selectedType.value === 'gift-wrapping')
    return giftWrappingAccessories.value
  if (selectedType.value === 'other')
    return otherAccessories.value
  return []
})

const currentTitle = computed(() => {
  if (selectedType.value === 'batteries')
    return 'Элементы питания'
  if (selectedType.value === 'gift-wrapping')
    return 'Подарочная упаковка'
  if (selectedType.value === 'other')
    return 'Аксессуары'
  return ''
})

const currentIcon = computed(() => {
  if (selectedType.value === 'batteries')
    return 'mdi:battery'
  if (selectedType.value === 'gift-wrapping')
    return 'mdi:gift'
  return 'lucide:package'
})

const currentIconClass = computed(() => {
  if (selectedType.value === 'batteries')
    return 'text-amber-600'
  if (selectedType.value === 'gift-wrapping')
    return 'text-pink-600'
  return 'text-blue-600'
})

function openAccessories(type: 'batteries' | 'gift-wrapping' | 'other') {
  selectedType.value = type
  if (isMobile.value) {
    isDrawerOpen.value = true
  }
  else {
    isModalOpen.value = true
  }
}

function closeAll() {
  isModalOpen.value = false
  isDrawerOpen.value = false
  selectedType.value = null
}
</script>

<template>
  <div v-if="loading || hasAnyAccessories" class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-4">
    <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
      <Icon name="lucide:plus-circle" class="w-5 h-5 text-primary" />
      С этим товаром покупают
    </h3>

    <!-- Skeleton during loading -->
    <div v-if="loading" class="grid grid-cols-2 gap-3">
      <div v-for="i in 2" :key="i" class="flex flex-col items-center p-4 rounded-xl border animate-pulse">
        <div class="w-12 h-12 bg-muted rounded-full mb-3" />
        <div class="h-4 bg-muted rounded w-24" />
      </div>
    </div>

    <!-- Accessory type cards -->
    <div v-else class="grid grid-cols-2 gap-3">
      <!-- Batteries card -->
      <button
        v-if="hasBatteries"
        class="relative flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-primary hover:bg-primary/5 group"
        :class="{ 'border-primary bg-primary/5': selectedBatteriesCount > 0 }"
        @click="openAccessories('batteries')"
      >
        <Badge
          v-if="selectedBatteriesCount > 0"
          class="absolute -top-2 -right-2 bg-primary text-white"
        >
          {{ selectedBatteriesCount }}
        </Badge>
        <div class="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
          <Icon name="mdi:battery" class="w-7 h-7 text-amber-600" />
        </div>
        <span class="text-sm font-medium text-center">Батарейки</span>
        <span class="text-xs text-muted-foreground mt-1">{{ batteriesAccessories.length }} шт.</span>
      </button>

      <!-- Gift wrapping card -->
      <button
        v-if="hasGiftWrapping"
        class="relative flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-primary hover:bg-primary/5 group"
        :class="{ 'border-primary bg-primary/5': selectedGiftWrappingCount > 0 }"
        @click="openAccessories('gift-wrapping')"
      >
        <Badge
          v-if="selectedGiftWrappingCount > 0"
          class="absolute -top-2 -right-2 bg-primary text-white"
        >
          {{ selectedGiftWrappingCount }}
        </Badge>
        <div class="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mb-3 group-hover:bg-pink-100 transition-colors">
          <Icon name="mdi:gift" class="w-7 h-7 text-pink-600" />
        </div>
        <span class="text-sm font-medium text-center">Подарочная упаковка</span>
        <span class="text-xs text-muted-foreground mt-1">{{ giftWrappingAccessories.length }} шт.</span>
      </button>

      <!-- Other accessories card -->
      <button
        v-if="hasOther"
        class="relative flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-primary hover:bg-primary/5 group"
        :class="{ 'border-primary bg-primary/5': selectedOtherCount > 0 }"
        @click="openAccessories('other')"
      >
        <Badge
          v-if="selectedOtherCount > 0"
          class="absolute -top-2 -right-2 bg-primary text-white"
        >
          {{ selectedOtherCount }}
        </Badge>
        <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
          <Icon name="lucide:package" class="w-7 h-7 text-blue-600" />
        </div>
        <span class="text-sm font-medium text-center">Аксессуары</span>
        <span class="text-xs text-muted-foreground mt-1">{{ otherAccessories.length }} шт.</span>
      </button>
    </div>

    <!-- Desktop Modal -->
    <Dialog v-model:open="isModalOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Icon
              :name="currentIcon"
              :class="currentIconClass"
              class="w-5 h-5"
            />
            {{ currentTitle }}
          </DialogTitle>
          <DialogDescription>
            Выберите товары, которые хотите добавить к заказу
          </DialogDescription>
        </DialogHeader>

        <div class="py-4">
          <AccessoriesCarousel
            :accessories="currentAccessories"
            :selected-ids="selectedIds"
            @toggle="toggleAccessory"
            @close="closeAll"
          />
        </div>
      </DialogContent>
    </Dialog>

    <!-- Mobile Drawer -->
    <Drawer v-model:open="isDrawerOpen">
      <DrawerContent class="max-h-[85vh]">
        <DrawerHeader class="text-left">
          <DrawerTitle class="flex items-center gap-2">
            <Icon
              :name="currentIcon"
              :class="currentIconClass"
              class="w-5 h-5"
            />
            {{ currentTitle }}
          </DrawerTitle>
          <DrawerDescription>
            Выберите товары, которые хотите добавить к заказу
          </DrawerDescription>
        </DrawerHeader>

        <div class="px-4 pb-6 overflow-y-auto">
          <AccessoriesCarousel
            :accessories="currentAccessories"
            :selected-ids="selectedIds"
            @toggle="toggleAccessory"
            @close="closeAll"
          />
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
