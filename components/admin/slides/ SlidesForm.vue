<script setup lang="ts">
import type { SlideRow } from '@/types'
import { useSlideForm } from '@/composables/admin/useSlideForm'

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
  handleSubmit,
  removeImage,
  handleImageChange,
  ctaLinkValue,
  ctaTextValue,
  descriptionValue,
} = useSlideForm(initialDataRef, {
  onSuccess: () => {
    emit('saved')
  },
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

        <div>
          <Label for="image">Изображение</Label>
          <Input
            id="image"
            type="file"
            accept="image/*"
            @change="handleImageChange"
          />
          <div
            v-if="imagePreviewUrl || formData.image_url"
            class="mt-2 border p-2 rounded-md inline-block relative"
          >
            <NuxtImg
              provider="supabase"
              :src="imagePreviewUrl || formData.image_url!"
              alt="Превью"
              class="max-w-[200px] max-h-[100px] object-contain rounded"
              placeholder
              format="webp"
              quality="80"
              loading="lazy"
            />
            <Button
              variant="destructive"
              size="icon"
              class="absolute -top-2 right-2 h-6 w-6 rounded-fill"
              type="button"
              @click="removeImage"
            >
              Удалить
            </Button>
          </div>
        </div>

        <div>
          <Label for="cta_text">Текст на кнопке</Label>
          <Input id="cta_text" v-model="ctaTextValue" />
        </div>

        <div>
          <Label for="cta_link">Текст на кнопке</Label>
          <Input
            id="cta_link"
            v-model="ctaLinkValue"
            placeholder="/catalog/new"
          />
        </div>

        <div class="grid grid-cols-2 gap-4 items-center">
          <div>
            <Label for="display_order">Порядок сортировка</Label>
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
          <Button type="submit" :disabled="isSaving">
            {{ isSaving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
