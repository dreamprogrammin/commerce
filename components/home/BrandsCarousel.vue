<script setup lang="ts">
import type { Brand } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

interface Props {
  brands: Brand[]
}

defineProps<Props>()

const { getVariantUrl } = useSupabaseStorage()
const headerContainerClass = carouselContainerVariants({ contained: 'always' })

function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
}
</script>

<template>
  <section v-if="brands && brands.length > 0" class="py-8 md:py-12 bg-linear-to-b from-background to-muted/10">
    <!-- Заголовок -->
    <div :class="headerContainerClass">
      <div class="flex items-center justify-between mb-4 md:mb-6">
        <h2 class="text-xl md:text-3xl font-bold">
          Популярные бренды
        </h2>
        <NuxtLink
          to="/brands"
          class="text-sm md:text-base text-primary hover:underline flex items-center gap-1"
        >
          Смотреть все
          <Icon name="lucide:arrow-right" class="w-4 h-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- Горизонтальный скролл чипсов -->
    <div class="relative">
      <!-- Fade edges -->
      <div class="pointer-events-none absolute inset-y-0 left-0 w-4 sm:w-8 bg-gradient-to-r from-background to-transparent z-10" />
      <div class="pointer-events-none absolute inset-y-0 right-0 w-4 sm:w-8 bg-gradient-to-l from-background to-transparent z-10" />

      <div class="overflow-x-auto scrollbar-hide scroll-smooth -webkit-overflow-scrolling-touch">
        <div class="flex gap-2 md:gap-3 px-4 sm:px-6 lg:px-8 pb-2">
          <NuxtLink
            v-for="brand in brands"
            :key="brand.id"
            :to="`/brand/${brand.slug}`"
            class="group flex items-center gap-2 md:gap-2.5 shrink-0 px-3 py-2 md:px-4 md:py-2.5 rounded-full border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm transition-all duration-200"
          >
            <!-- Логотип -->
            <div class="w-7 h-7 md:w-8 md:h-8 rounded-full bg-muted/50 overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-border/40">
              <ProgressiveImage
                v-if="brand.logo_url"
                :src="getBrandLogoUrl(brand.logo_url) || ''"
                :blur-data-url="brand.blur_placeholder"
                :alt="brand.name"
                object-fit="contain"
                :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
                class="w-full h-full p-0.5"
              />
              <Icon
                v-else
                name="lucide:package"
                class="w-4 h-4 text-muted-foreground"
              />
            </div>

            <!-- Название -->
            <span class="text-xs md:text-sm font-medium whitespace-nowrap group-hover:text-primary transition-colors">
              {{ brand.name }}
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
