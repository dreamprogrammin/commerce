<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'

const popularCategories = usePopularCategoriesStore()
const { getPublicUrl } = useSupabaseStorage()
</script>

<template>
  <div class="container py-8 md:py-12">
    <h2 class="text-2xl md:text-3xl font-bold tracking-tight text-center mb-8">
      Популярные категории
    </h2>

    <div
      v-if="popularCategories.isLoading"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
    >
      <div v-for="i in 6" :key="i">
        <Skeleton class="w-full h-32 rounded-lg" />
        <Skeleton class="w-3/4 h-5 mt-2 rounded-md" />
      </div>
    </div>

    <div
      v-else-if="popularCategories.popularCategories.length > 0"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
    >
      <NuxtLink
        v-for="category in popularCategories.popularCategories"
        :key="category.id"
        :to="category.href"
        class="group"
      >
        <Card
          class="overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
        >
          <CardContent class="p-0 flex flex-col items-center text-center">
            <NuxtImg
              :src="
                getPublicUrl(BUCKET_NAME_CATEGORY, category.image_url || null)
                  || '/images/placeholder.svg'
              "
              :alt="category.name"
              class="w-full h-32 object-cover"
              loading="lazy"
              placeholder
              format="webp"
              quality="80"
            />
            <p class="font-semibold p-3 text-sm md:text-base">
              {{ category.name }}
            </p>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <div v-else class="text-center text-muted-foreground py-10">
      <p>Популярные категории скоро появятся здесь.</p>
    </div>
  </div>
</template>
