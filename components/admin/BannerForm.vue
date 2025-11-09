<script setup lang="ts">
import type { Banner } from '@/types'
import { Separator } from 'reka-ui'
import { useBannerForm } from '@/composables/admin/useBannerForm'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BANNERS } from '@/constants'

const props = defineProps<{
  banner: Banner | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const open = defineModel<boolean>('open', { required: true })

const bannerRef = computed(() => props.banner ?? null)

const {
  formData,
  isSaving,
  isEditMode,
  imagePreviewUrl,
  handleSubmit,
  removeImage,
  handleImageChange,
  descriptionValue,
  ctaLinkValue,
  seoTitleValue,
  seoDescriptionValue,
} = useBannerForm(bannerRef, {
  onSuccess: () => {
    emit('saved')
    open.value = false
  },
})

const { getPublicUrl } = useSupabaseStorage()

// Computed для отображения текущего изображения
const currentImageUrl = computed(() => {
  if (imagePreviewUrl.value)
    return imagePreviewUrl.value
  if (formData.value.image_url) {
    return getPublicUrl(BUCKET_NAME_BANNERS, formData.value.image_url)
  }
  return null
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {{ isEditMode ? 'Редактирование баннера' : 'Создание нового баннера' }}
        </DialogTitle>
        <DialogDescription>
          Баннеры отображаются на главной странице после слайдера. Поля со звездочкой (*) обязательны.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-6 py-4" @submit.prevent="handleSubmit">
        <!-- Заголовок -->
        <div>
          <Label for="title">Заголовок *</Label>
          <Input
            id="title"
            v-model="formData.title"
            placeholder="Введите заголовок баннера"
            required
          />
        </div>

        <!-- Описание -->
        <div>
          <Label for="description">Описание</Label>
          <Textarea
            id="description"
            v-model="descriptionValue"
            placeholder="Краткое описание (опционально)"
            rows="3"
          />
        </div>

        <!-- Изображение -->
        <div>
          <Label for="image">Изображение баннера</Label>
          <Input
            id="image"
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            @change="handleImageChange"
          />
          <p class="text-xs text-muted-foreground mt-1">
            Форматы: JPEG, PNG, WebP, GIF. Максимум 5MB. Рекомендуемый размер: 1200x400px
          </p>

          <div
            v-if="currentImageUrl"
            class="mt-3 border p-2 rounded-md inline-block relative"
          >
            <img
              :src="currentImageUrl"
              alt="Предпросмотр"
              class="max-w-full max-h-[200px] object-contain rounded"
              loading="lazy"
            >
            <Button
              variant="destructive"
              size="icon"
              class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              type="button"
              @click="removeImage"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Ссылка -->
        <div>
          <Label for="cta_link">Ссылка</Label>
          <Input
            id="cta_link"
            v-model="ctaLinkValue"
            type="text"
            placeholder="/catalog/boys"
          />
          <p class="text-xs text-muted-foreground mt-1">
            Внутренняя ссылка на страницу (например: /catalog/boys, /products/123)
          </p>
        </div>

        <!-- Порядок и Активность -->
        <div class="grid grid-cols-2 gap-4 items-center">
          <div>
            <Label for="display_order">Порядок отображения</Label>
            <Input
              id="display_order"
              v-model.number="formData.display_order"
              type="number"
              min="0"
              placeholder="0"
            />
            <p class="text-xs text-muted-foreground mt-1">
              0 - первый, 1 - второй
            </p>
          </div>

          <div class="flex items-center space-x-2 pt-6">
            <Switch
              id="is_active"
              v-model:model-value="formData.is_active"
            />
            <Label for="is_active">Активен</Label>
          </div>
        </div>

        <!-- SEO поля -->
        <Separator />

        <div class="space-y-4">
          <h3 class="text-sm font-semibold">
            SEO настройки (опционально)
          </h3>

          <div>
            <Label for="seo_title">SEO заголовок</Label>
            <Input
              id="seo_title"
              v-model="seoTitleValue"
              placeholder="Заголовок для поисковых систем"
              maxlength="60"
            />
          </div>

          <div>
            <Label for="seo_description">SEO описание</Label>
            <Textarea
              id="seo_description"
              v-model="seoDescriptionValue"
              placeholder="Описание для мета-тегов"
              rows="2"
              maxlength="160"
            />
          </div>
        </div>

        <!-- Кнопки действий -->
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            :disabled="isSaving"
            @click="open = false"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            :disabled="isSaving"
          >
            {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
