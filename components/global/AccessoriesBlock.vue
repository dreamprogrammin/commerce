<script setup lang="ts">
import type { AccessoryProduct } from '@/types'

const props = defineProps<{
  accessories: AccessoryProduct[]
  loading?: boolean
}>()

const isMobile = ref(false)
const isModalOpen = ref(false)
const isDrawerOpen = ref(false)
const selectedType = ref<'batteries' | 'gift-wrapping' | null>(null)

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

const hasBatteries = computed(() => batteriesAccessories.value.length > 0)
const hasGiftWrapping = computed(() => giftWrappingAccessories.value.length > 0)

const currentAccessories = computed(() => {
  if (selectedType.value === 'batteries')
    return batteriesAccessories.value
  if (selectedType.value === 'gift-wrapping')
    return giftWrappingAccessories.value
  return []
})

const currentTitle = computed(() => {
  if (selectedType.value === 'batteries')
    return 'Элементы питания'
  if (selectedType.value === 'gift-wrapping')
    return 'Подарочная упаковка'
  return ''
})

function openAccessories(type: 'batteries' | 'gift-wrapping') {
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
  <div v-if="loading || hasBatteries || hasGiftWrapping" class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-4">
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
        class="flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-primary hover:bg-primary/5 group"
        @click="openAccessories('batteries')"
      >
        <div class="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
          <Icon name="mdi:battery" class="w-7 h-7 text-amber-600" />
        </div>
        <span class="text-sm font-medium text-center">Батарейки</span>
        <span class="text-xs text-muted-foreground mt-1">{{ batteriesAccessories.length }} шт.</span>
      </button>

      <!-- Gift wrapping card -->
      <button
        v-if="hasGiftWrapping"
        class="flex flex-col items-center p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md hover:border-primary hover:bg-primary/5 group"
        @click="openAccessories('gift-wrapping')"
      >
        <div class="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center mb-3 group-hover:bg-pink-100 transition-colors">
          <Icon name="mdi:gift" class="w-7 h-7 text-pink-600" />
        </div>
        <span class="text-sm font-medium text-center">Подарочная упаковка</span>
        <span class="text-xs text-muted-foreground mt-1">{{ giftWrappingAccessories.length }} шт.</span>
      </button>
    </div>

    <!-- Desktop Modal -->
    <Dialog v-model:open="isModalOpen">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Icon
              :name="selectedType === 'batteries' ? 'mdi:battery' : 'mdi:gift'"
              :class="selectedType === 'batteries' ? 'text-amber-600' : 'text-pink-600'"
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
              :name="selectedType === 'batteries' ? 'mdi:battery' : 'mdi:gift'"
              :class="selectedType === 'batteries' ? 'text-amber-600' : 'text-pink-600'"
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
            @close="closeAll"
          />
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
