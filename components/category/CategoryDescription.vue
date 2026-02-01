<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage';
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'

const props = defineProps<{
  category: {
    id: string
    name: string
    description?: string | null
    image_url?: string | null
    blur_placeholder?: string | null
  }
}>()

// Используем композабл для работы с изображениями
const { getImageUrl } = useSupabaseStorage()
</script>

<template>
  <div
    v-if="category.description || category.image_url"
    class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 shadow-sm border mb-6 lg:mb-8"
  >
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      <!-- Изображение слева -->
      <div
        v-if="category.image_url"
        class="lg:col-span-4 flex items-start justify-center"
      >
        <div class="w-full max-w-sm rounded-lg overflow-hidden shadow-md">
          <ProgressiveImage
            :src="getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, IMAGE_SIZES.CATEGORY_IMAGE)"
            :alt="category.name"
            aspect-ratio="square"
            object-fit="cover"
            placeholder-type="lqip"
            :blur-data-url="category.blur_placeholder"
            :eager="true"
          />
        </div>
      </div>

      <!-- Текстовое описание справа -->
      <div
        :class="category.image_url ? 'lg:col-span-8' : 'lg:col-span-12'"
        class="flex flex-col justify-center"
      >
        <div
          v-if="category.description"
          class="prose prose-sm lg:prose-base max-w-none text-foreground"
          v-html="category.description"
        />
      </div>
    </div>
  </div>
</template>
