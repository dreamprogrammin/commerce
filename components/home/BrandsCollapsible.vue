<script setup lang="ts">
import type { Brand } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'

const supabase = useSupabaseClient()
const { getVariantUrl } = useSupabaseStorage()

const { data: brands } = await useAsyncData(
  'home-brands',
  async () => {
    const { data } = await supabase
      .from('brands')
      .select('id, name, slug, logo_url, blur_placeholder')
      .order('name', { ascending: true })
      .limit(20)
    return data || []
  },
  { server: false, lazy: true },
)

const topBrands = computed(() => (brands.value as Brand[] || []).slice(0, 4))
const otherBrands = computed(() => (brands.value as Brand[] || []).slice(4))

function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
}
</script>

<template>
  <div v-if="brands && brands.length > 0">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">
        Популярные бренды
      </h2>
      <NuxtLink
        to="/brands"
        class="text-sm text-primary hover:underline flex items-center gap-1"
      >
        Все бренды
        <Icon name="lucide:arrow-right" class="w-4 h-4" />
      </NuxtLink>
    </div>

    <div class="flex flex-wrap gap-3">
      <NuxtLink
        v-for="brand in topBrands"
        :key="brand.id"
        :to="`/brand/${brand.slug}`"
        class="flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted rounded-lg transition-colors group"
      >
        <div class="w-8 h-8 rounded-full bg-background flex items-center justify-center overflow-hidden shrink-0">
          <ProgressiveImage
            v-if="brand.logo_url"
            :src="getBrandLogoUrl(brand.logo_url) || ''"
            :blur-data-url="brand.blur_placeholder"
            :alt="brand.name"
            object-fit="contain"
            :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
            class="w-full h-full p-1"
          />
          <Icon v-else name="lucide:package" class="w-4 h-4 text-muted-foreground" />
        </div>
        <span class="text-sm font-medium group-hover:text-primary transition-colors">
          {{ brand.name }}
        </span>
      </NuxtLink>
    </div>
    
    <Collapsible v-if="otherBrands.length > 0" class="mt-3">
      <CollapsibleTrigger class="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
        <span>Показать ещё {{ otherBrands.length }} брендов</span>
        <Icon name="lucide:chevron-down" class="w-4 h-4" />
      </CollapsibleTrigger>
      <CollapsibleContent class="mt-3">
        <div class="flex flex-wrap gap-3">
          <NuxtLink
            v-for="brand in otherBrands"
            :key="brand.id"
            :to="`/brand/${brand.slug}`"
            class="flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted rounded-lg transition-colors group"
          >
            <div class="w-8 h-8 rounded-full bg-background flex items-center justify-center overflow-hidden shrink-0">
              <ProgressiveImage
                v-if="brand.logo_url"
                :src="getBrandLogoUrl(brand.logo_url) || ''"
                :blur-data-url="brand.blur_placeholder"
                :alt="brand.name"
                object-fit="contain"
                :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
                class="w-full h-full p-1"
              />
              <Icon v-else name="lucide:package" class="w-4 h-4 text-muted-foreground" />
            </div>
            <span class="text-sm font-medium group-hover:text-primary transition-colors">
              {{ brand.name }}
            </span>
          </NuxtLink>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
</template>
