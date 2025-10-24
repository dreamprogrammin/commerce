<script setup lang="ts">
import SlidesForm from '@/components/admin/slides/ SlidesForm.vue'
import { useAdminSlides } from '@/composables/admin/useAdminSlides'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_SLIDES } from '@/constants'

definePageMeta({
  layout: 'admin',
})

const {
  slides,
  error,
  isLoading,
  isFormOpen,
  selectedSlide,
  openFormForNew,
  openFormForEdit,
  handleDelete,
  handleFormSaved,
} = useAdminSlides()

const { getOptimizedUrl } = useSupabaseStorage()

// Функция для получения оптимизированного изображения слайда
function getSlideImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return null

  return getOptimizedUrl(BUCKET_NAME_SLIDES, imageUrl, {
    width: 600,
    height: 338, // 16:9 aspect ratio
    quality: 85,
    format: 'webp',
    resize: 'cover',
  })
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div
      class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8"
    >
      <h1 class="text-3xl font-bold text-foreground">
        Управление слайдами
      </h1>

      <Button @click="openFormForNew">
        Добавить слайд
      </Button>
    </div>

    <div v-if="isLoading" class="text-center py-20">
      Загрузка...
    </div>

    <div
      v-else-if="error"
      class="my-6 p-4 bg-destructive/10 text-destructive border rounded-md shadow"
    >
      <strong>Ошибка загрузки:</strong> {{ error.message }}
    </div>

    <div
      v-else-if="slides && slides.length > 0"
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <Card
        v-for="slide in slides"
        :key="slide.id"
        class="flex flex-col hover:shadow-md transition-shadow"
      >
        <CardHeader>
          <div class="flex justify-between items-start gap-2">
            <CardTitle class="text-lg leading-tight">
              {{ slide.title }}
            </CardTitle>
            <Badge :variant="slide.is_active ? 'default' : 'outline'">
              {{ slide.is_active ? "Активен" : "Скрыт" }}
            </Badge>
          </div>
          <CardDescription v-if="slide.description" class="line-clamp-2 pt-1">
            {{ slide.description }}
          </CardDescription>
        </CardHeader>

        <CardContent class="flex-grow">
          <img
            v-if="slide.image_url"
            :src="getSlideImageUrl(slide.image_url) || '/images/placeholder.svg'"
            :alt="slide.title"
            class="rounded-md object-cover aspect-video w-full bg-muted"
            loading="lazy"
          >

          <div
            v-else
            class="rounded-md aspect-video w-full bg-muted flex items-center justify-center text-muted-foreground"
          >
            Картинки нет
          </div>
        </CardContent>

        <CardFooter class="flex justify-end gap-2 pt-4">
          <Button variant="outline" size="sm" @click="openFormForEdit(slide)">
            Редактировать
          </Button>
          <Button variant="destructive" size="sm" @click="handleDelete(slide.id)">
            Удалить
          </Button>
        </CardFooter>
      </Card>
    </div>

    <div v-else class="text-center py-20 border-2 border-dashed rounded-lg">
      <h2 class="text-xl font-semibold">
        Слайдов пока нет
      </h2>
      <p class="text-muted-foreground mt-2">
        Нажмите кнопку "Добавить слайд", чтобы создать первый.
      </p>
    </div>

    <SlidesForm
      v-model:open="isFormOpen"
      :initial-data="selectedSlide"
      @saved="handleFormSaved"
    />
  </div>
</template>
