<script setup lang="ts">
import type { ProductLine } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'

const props = defineProps<{
  productLines: ProductLine[]
  brandId: string
}>()

const { getVariantUrl } = useSupabaseStorage()

function getLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, 'sm')
}

function getCatalogLink(lineId: string): string {
  return `/catalog/all?brands=${props.brandId}&lines=${lineId}`
}
</script>

<template>
  <div v-if="productLines.length > 0">
    <h2 class="text-xl md:text-2xl font-bold mb-3 md:mb-4">
      Коллекции
    </h2>

    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      <NuxtLink
        v-for="line in productLines"
        :key="line.id"
        :to="getCatalogLink(line.id)"
        class="group relative aspect-[4/3] rounded-xl overflow-hidden border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-200"
      >
        <!-- С картинкой -->
        <template v-if="line.logo_url">
          <ProgressiveImage
            :src="getLogoUrl(line.logo_url)"
            :alt="line.name"
            object-fit="cover"
            placeholder-type="shimmer"
            class="w-full h-full group-hover:scale-105 transition-transform duration-300"
          />
          <div class="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm px-2 py-1.5 md:px-3 md:py-2">
            <span class="text-white text-xs md:text-sm font-semibold line-clamp-1">
              {{ line.name }}
            </span>
          </div>
        </template>

        <!-- Fallback без картинки -->
        <div
          v-else
          class="w-full h-full bg-gradient-to-br from-primary/80 to-secondary/80 flex items-center justify-center p-3 group-hover:scale-105 transition-transform duration-300"
        >
          <span class="text-white text-sm md:text-base font-bold text-center line-clamp-3">
            {{ line.name }}
          </span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
