<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog";
import Input from "~/components/ui/input/Input.vue";
import Button from "~/components/ui/button/Button.vue";
import Switch from "~/components/ui/switch/Switch.vue";
import { Label } from "~/components/ui/label";
import { useSlideForm } from "~/composables/admin/useSlideForm";
import type { SlideRow } from "~/types";

const props = defineProps<{
  initialData: SlideRow | null;
}>();

const open = defineModel<boolean>("open", { required: true });

const emit = defineEmits<{
  (e: "saved"): void;
}>();

const initialDataRef = toRef(props, "initialData");

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
    emit("saved");
  },
});
</script>
<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {{ isEditMode ? "Редактирование слайда" : "Создание нового слайда" }}
        </DialogTitle>
        <DialogDescription
          >Заполните информацию о слайде. Поля со звездочкой (*)
          обязательны.</DialogDescription
        >
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="grid gap-6 py-4">
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
            @change="handleImageChange"
            accept="image/*"
          />
          <div
            v-if="imagePreviewUrl || formData.image_url"
            class="mt-2 border p-2 rounded-md inline-block relative"
          >
            <img
              :src="imagePreviewUrl || formData.image_url!"
              alt="Превью"
              class="max-w-[200px] max-h-[100px] object-contain rounded"
            />
            <Button
              @click="removeImage"
              variant="destructive"
              size="icon"
              class="absolute -top-2 right-2 h-6 w-6 rounded-fill"
              type="button"
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
              type="number"
              v-model.number="formData.display_order"
            />
          </div>
        </div>

        <div class="flex items-center space-x-2 pt-6">
          <Switch id="is_active" v-model:checked="formData.is_active" />
          <Label for="is_active">Слайд активен</Label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false"
            >Отмена</Button
          >
          <Button type="submit" :disabled="isSaving">
            {{ isSaving ? "Сохранение..." : "Сохранить" }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
