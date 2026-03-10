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

// Сбрасываем поиск при закрытии
watch(isOpen, (opened) => {
  if (!opened)
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
            class="grid grid-cols-2 gap-3"
          >
            <NuxtLink
              v-for="line in filteredLines"
              :key="line.id"
              v-memo="[line.id, line.name, line.logo_url]"
              :to="`/catalog/all?brands=${brandId}&lines=${line.id}`"
              class="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-md transition-all duration-200"
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
                <div class="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm px-2 py-1.5">
                  <span class="text-white text-xs font-semibold line-clamp-1">{{ line.name }}</span>
                </div>
              </template>

              <div
                v-else
                class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 flex items-center justify-center p-3"
              >
                <span class="text-white text-sm font-bold text-center line-clamp-2">{{ line.name }}</span>
              </div>
            </NuxtLink>
          </div>

          <div v-else class="py-12 text-center text-muted-foreground text-sm">
            Коллекции не найдены
          </div>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
</template>
