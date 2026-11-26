<script setup lang="ts">
import type { SlideRow } from '@/types'
import { useSlideForm } from '@/composables/admin/useSlideForm'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_SLIDES } from '@/constants'

const props = defineProps<{
  initialData: SlideRow | null
}>()

const emit = defineEmits<{
  (e: 'saved'): void
}>()

const open = defineModel<boolean>('open', { required: true })

const initialDataRef = toRef(props, 'initialData')

const {
  formData,
  isSaving,
  isEditMode,
  imagePreviewUrl,
  isProcessingImage,
  optimizationInfo,
  handleSubmit,
  removeImage,
  handleImageChange,
  imagePreviewUrlMobile,
  handleImageChangeMobile,
  removeImageMobile,
  ctaLinkValue,
  ctaTextValue,
  descriptionValue,
} = useSlideForm(initialDataRef, {
  onSuccess: () => {
    emit('saved')
  },
})

const { getImageUrl } = useSupabaseStorage()

const optimizedPreviewUrl = computed(() => {
  if (imagePreviewUrl.value) {
    return imagePreviewUrl.value
  }

  const imageUrl = formData.value.image_url
  if (imageUrl && typeof imageUrl === 'string') {
    return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.SLIDER_BANNER)
  }

  return null
})

const optimizedPreviewUrlMobile = computed(() => {
  if (imagePreviewUrlMobile.value) {
    return imagePreviewUrlMobile.value
  }
  const imageUrl = formData.value.image_url_mobile
  if (imageUrl && typeof imageUrl === 'string') {
    return getImageUrl(BUCKET_NAME_SLIDES, imageUrl, IMAGE_SIZES.MOBILE) // Используем другой пресет
  }
  return null
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {{ isEditMode ? "Редактирование слайда" : "Создание нового слайда" }}
        </DialogTitle>
        <DialogDescription>
          Заполните информацию о слайде. Поля со звездочкой (*)
          обязательны.
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-6 py-4" @submit.prevent="handleSubmit">
        <div>
          <Label for="title">Заголовок *</Label>
          <Input id="title" v-model="formData.title" />
        </div>

        <div>
          <Label for="description">Описание *</Label>
          <Input id="description" v-model="descriptionValue" />
        </div>

        <div class="p-4 border rounded-md">
          <Label for="image" class="font-semibold">Изображение для десктопа (21:9)</Label>
          <div class="flex items-center gap-2 mt-1 mb-2">
            <span class="text-xs text-muted-foreground">
              {{ optimizationInfo.icon }} {{ optimizationInfo.name }}
            </span>
          </div>
          <Input
            id="image"
            type="file"
            accept="image/*"
            :disabled="isProcessingImage"
            @change="handleImageChange"
          />
          <div v-if="isProcessingImage" class="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <div class="w-4 h-4 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
            {{ optimizationInfo.icon }} Обработка изображения...
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            💡 {{ optimizationInfo.recommendation }}
          </p>
          <div
            v-if="optimizedPreviewUrl"
            class="mt-2 border p-2 rounded-md inline-block relative"
          >
            <img
              :src="optimizedPreviewUrl"
              alt="Превью"
              class="max-w-[200px] max-h-[100px] object-contain rounded"
              loading="lazy"
            >
            <Button
              variant="destructive"
              size="icon"
              class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              type="button"
              @click="removeImage"
            >
              ×
            </Button>
          </div>
        </div>

        <div class="p-4 border rounded-md">
          <Label for="image-mobile" class="font-semibold">Изображение для мобильных (3:2)</Label>
          <div class="flex items-center gap-2 mt-1 mb-2">
            <span class="text-xs text-muted-foreground">{{ optimizationInfo.icon }} {{ optimizationInfo.name }}</span>
          </div>
          <Input
            id="image-mobile"
            type="file"
            accept="image/*"
            :disabled="isProcessingImage"
            @change="handleImageChangeMobile"
          />
          <div v-if="isProcessingImage" class="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <div class="w-4 h-4 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
            {{ optimizationInfo.icon }} Обработка изображения...
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            💡 {{ optimizationInfo.recommendation }}
          </p>
          <div
            v-if="optimizedPreviewUrlMobile"
            class="mt-2 border p-2 rounded-md inline-block relative"
          >
            <img
              :src="optimizedPreviewUrlMobile"
              alt="Превью мобильной версии"
              class="max-w-[200px] max-h-[100px] object-contain rounded"
              loading="lazy"
            >
            <Button
              variant="destructive"
              size="icon"
              class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              type="button"
              @click="removeImageMobile"
            >
              ×
            </Button>

            <div>
              <Label for="cta_text">Текст на кнопке</Label>
              <Input id="cta_text" v-model="ctaTextValue" />
            </div>

            <div>
              <Label for="cta_link">Ссылка кнопки</Label>
              <Input
                id="cta_link"
                v-model="ctaLinkValue"
                placeholder="/catalog/new"
              />
            </div>

            <div class="grid grid-cols-2 gap-4 items-center">
              <div>
                <Label for="display_order">Порядок сортировки</Label>
                <Input
                  id="display_order"
                  v-model.number="formData.display_order"
                  type="number"
                />
              </div>
            </div>

            <div class="flex items-center space-x-2 pt-6">
              <Switch id="is_active" v-model:model-value="formData.is_active" />
              <Label for="is_active">Слайд активен</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" @click="open = false">
                Отмена
              </Button>
              <Button type="submit" :disabled="isSaving || isProcessingImage">
                {{ isSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
