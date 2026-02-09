<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
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
          class="category-description text-foreground"
          v-html="category.description"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Базовые стили для описания категории */
/* inline-стили из HTML будут иметь приоритет автоматически */

.category-description :deep(h1) {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}

.category-description :deep(h2) {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
}

.category-description :deep(h3) {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.4;
}

.category-description :deep(h4) {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
}

.category-description :deep(p) {
  font-size: 1rem;
  line-height: 1.7;
}

.category-description :deep(ul),
.category-description :deep(ol) {
  list-style-position: outside;
}

.category-description :deep(ul) {
  list-style-type: disc;
}

.category-description :deep(ol) {
  list-style-type: decimal;
}

.category-description :deep(li) {
  line-height: 1.7;
}

.category-description :deep(strong) {
  font-weight: 600;
}

.category-description :deep(a) {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}

.category-description :deep(a:hover) {
  opacity: 0.8;
}
</style>
