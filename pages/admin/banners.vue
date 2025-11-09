<script setup lang="ts">
import BannerForm from '@/components/admin/BannerForm.vue'
import { useAdminBanners } from '@/composables/admin/useAdminBanners'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BANNERS } from '@/constants'

definePageMeta({
  layout: 'admin',
})

const {
  banners,
  error,
  isLoading,
  isFormOpen,
  selectedBanner,
  openFormForNew,
  openFormForEdit,
  handleDelete,
  handleFormSaved,
} = useAdminBanners()

const { getPublicUrl } = useSupabaseStorage()

function getBannerImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return null
  return getPublicUrl(BUCKET_NAME_BANNERS, imageUrl)
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
      <div>
        <h1 class="text-3xl font-bold text-foreground">
          Управление баннерами
        </h1>
        <p class="text-muted-foreground mt-1">
          Отображаются на главной странице после слайдера (максимум 2 баннера)
        </p>
      </div>
      <Button :disabled="banners && banners.length >= 2" @click="openFormForNew">
        <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
        Добавить баннер
      </Button>
    </div>

    <!-- Загрузка -->
    <div v-if="isLoading" class="text-center py-20">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
      <p class="text-muted-foreground mt-4">
        Загрузка баннеров...
      </p>
    </div>

    <!-- Ошибка -->
    <div
      v-else-if="error"
      class="my-6 p-4 bg-destructive/10 text-destructive border border-destructive rounded-md shadow"
    >
      <div class="flex items-start gap-3">
        <Icon name="lucide:alert-circle" class="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div>
          <strong class="font-semibold">Ошибка загрузки:</strong>
          <p class="mt-1">
            {{ error.message }}
          </p>
        </div>
      </div>
    </div>

    <!-- Список баннеров -->
    <div
      v-else-if="banners && banners.length > 0"
      class="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      <Card
        v-for="banner in banners"
        :key="banner.id"
        class="flex flex-col hover:shadow-lg transition-all duration-200"
      >
        <CardHeader>
          <div class="flex justify-between items-start gap-3">
            <div class="flex-1 min-w-0">
              <CardTitle class="text-lg leading-tight truncate">
                {{ banner.title }}
              </CardTitle>
              <div class="flex items-center gap-2 mt-2">
                <Badge :variant="banner.is_active ? 'default' : 'outline'">
                  {{ banner.is_active ? 'Активен' : 'Скрыт' }}
                </Badge>
                <Badge variant="secondary">
                  Порядок: {{ banner.display_order }}
                </Badge>
              </div>
            </div>
          </div>
          <CardDescription v-if="banner.description" class="line-clamp-2 pt-2">
            {{ banner.description }}
          </CardDescription>
        </CardHeader>

        <CardContent class="flex-grow">
          <!-- Изображение -->
          <div class="relative aspect-[3/1] w-full rounded-lg overflow-hidden bg-muted">
            <img
              v-if="banner.image_url"
              :src="getBannerImageUrl(banner.image_url) || '/images/placeholder.svg'"
              :alt="banner.title"
              class="w-full h-full object-cover"
              loading="lazy"
            >
            <div
              v-else
              class="w-full h-full flex flex-col items-center justify-center text-muted-foreground"
            >
              <Icon name="lucide:image-off" class="w-12 h-12 mb-2" />
              <span class="text-sm">Нет изображения</span>
            </div>
          </div>

          <!-- Дополнительная информация -->
          <div class="mt-4 space-y-2 text-sm text-muted-foreground">
            <div v-if="banner.cta_link" class="flex items-center gap-2">
              <Icon name="lucide:link" class="w-4 h-4 flex-shrink-0" />
              <span class="truncate">{{ banner.cta_link }}</span>
            </div>
            <div v-if="banner.seo_title" class="flex items-center gap-2">
              <Icon name="lucide:search" class="w-4 h-4 flex-shrink-0" />
              <span class="truncate">SEO: {{ banner.seo_title }}</span>
            </div>
          </div>
        </CardContent>

        <CardFooter class="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" @click="openFormForEdit(banner)">
            <Icon name="lucide:pencil" class="w-4 h-4 mr-1" />
            Редактировать
          </Button>
          <Button variant="destructive" size="sm" @click="handleDelete(banner.id)">
            <Icon name="lucide:trash-2" class="w-4 h-4 mr-1" />
            Удалить
          </Button>
        </CardFooter>
      </Card>
    </div>

    <!-- Пустое состояние -->
    <div v-else class="text-center py-20 border-2 border-dashed rounded-lg bg-muted/20">
      <Icon name="lucide:layout-template" class="w-16 h-16 mx-auto text-muted-foreground mb-4" />
      <h2 class="text-xl font-semibold">
        Баннеров пока нет
      </h2>
      <p class="text-muted-foreground mt-2 max-w-md mx-auto">
        Нажмите кнопку "Добавить баннер", чтобы создать первый баннер для главной страницы.
      </p>
      <Button class="mt-6" @click="openFormForNew">
        <Icon name="lucide:plus" class="w-4 h-4 mr-2" />
        Создать первый баннер
      </Button>
    </div>

    <!-- Подсказка при максимуме -->
    <div v-if="banners && banners.length >= 2" class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div class="flex items-start gap-3">
        <Icon name="lucide:info" class="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div class="text-sm text-blue-900">
          <p class="font-medium">
            Достигнут лимит баннеров
          </p>
          <p class="mt-1 text-blue-700">
            Отображается максимум 2 баннера. Удалите существующий, чтобы добавить новый.
          </p>
        </div>
      </div>
    </div>

    <!-- Форма создания/редактирования -->
    <BannerForm
      v-model:open="isFormOpen"
      :banner="selectedBanner"
      @saved="handleFormSaved"
    />
  </div>
</template>
