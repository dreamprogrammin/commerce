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

<style>
/* НЕ scoped стили для корректной работы с v-html */

/* Базовые стили для элементов БЕЗ inline-стилей */
.category-description h1:not([style]) {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2rem;
  margin-bottom: 1rem;
}

.category-description h2:not([style]) {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1.75rem;
  margin-bottom: 1rem;
}

.category-description h3:not([style]) {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
}

.category-description h4:not([style]) {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.25rem;
  margin-bottom: 0.75rem;
}

.category-description p:not([style]) {
  font-size: 1rem;
  line-height: 1.7;
  margin-bottom: 1rem;
}

.category-description ul:not([style]),
.category-description ol:not([style]) {
  list-style-position: outside;
  margin-bottom: 1.25rem;
  padding-left: 1.25rem;
}

.category-description ul:not([style]) {
  list-style-type: disc;
}

.category-description ol:not([style]) {
  list-style-type: decimal;
}

.category-description li:not([style]) {
  line-height: 1.7;
  margin-bottom: 0.5rem;
}

/* Эти стили применяются всегда */
.category-description strong {
  font-weight: 600;
}

.category-description a {
  color: rgb(var(--color-primary));
  text-decoration: underline;
}

.category-description a:hover {
  opacity: 0.8;
}
</style>
