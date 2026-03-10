<script setup lang="ts">
import type { ProductLine } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'

const props = defineProps<{
  lines: ProductLine[]
  brandId: string
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const { getVariantUrl } = useSupabaseStorage()

const isOpen = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val),
})

const searchQuery = ref('')

const filteredLines = computed(() =>
  props.lines.filter(l =>
    l.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
  ),
)

function getLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, 'sm')
}

function handleLineClick() {
  isOpen.value = false
}

// Гарантированный сброс при каждом открытии/закрытии
watch(isOpen, () => {
  searchQuery.value = ''
})
</script>

<template>
  <Drawer v-model:open="isOpen">
    <DrawerContent class="max-h-[85vh]">
      <div class="flex flex-col overflow-hidden" style="max-height: calc(85vh - 2.5rem)">
        <!-- Header -->
        <DrawerHeader class="px-4 pb-2 shrink-0">
          <DrawerTitle>Все коллекции</DrawerTitle>
        </DrawerHeader>

        <!-- Поиск -->
        <div class="px-4 pb-3 shrink-0">
          <BrandSearchInput
            v-model="searchQuery"
            placeholder="Поиск коллекции..."
            aria-label="Поиск по коллекциям бренда"
          />
        </div>

        <!-- Сетка коллекций -->
        <div class="overflow-y-auto overscroll-y-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div
            v-if="filteredLines.length > 0"
            class="grid grid-cols-2 gap-2"
          >
            <NuxtLink
              v-for="line in filteredLines"
              :key="line.id"
              :to="`/catalog/all?brands=${brandId}&lines=${line.id}`"
              class="group relative aspect-[3/2] rounded-lg overflow-hidden border border-border/60 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              @click="handleLineClick"
            >
              <template v-if="line.logo_url">
                <ProgressiveImage
                  :src="getLogoUrl(line.logo_url)"
                  :alt="line.name"
                  object-fit="cover"
                  placeholder-type="shimmer"
                  class="w-full h-full group-hover:scale-105 transition-transform duration-300"
                />
                <div class="absolute inset-x-0 bottom-0 px-2 py-1.5">
                  <span class="text-white text-xs font-semibold line-clamp-1 drop-shadow-sm">{{ line.name }}</span>
                </div>
              </template>

              <div
                v-else
                class="w-full h-full bg-gradient-to-br from-primary/70 to-secondary/70 flex items-end p-2"
              >
                <span class="text-white text-xs font-semibold line-clamp-2">{{ line.name }}</span>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="py-12 text-center text-muted-foreground text-sm">
            Ничего не найдено
          </div>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
</template>
