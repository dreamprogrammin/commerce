<script setup lang="ts">
import { toRef, computed, watch } from "vue";
import type { Database } from "~/types/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMenuItemForm } from "~/composables/menuItems/useMenuItemsForm";
import { useTopMenuItemsStore } from "~/stores/menuItems/useTopMenuItems";
import type { MenuItemRow } from "~/types";
import { BUCKET_NAME } from "~/constants";

const props = defineProps<{
  selectedItem: MenuItemRow | null;
}>();

const emit = defineEmits<{
  (e: "form-saved"): void;
  (e: "form-cancel"): void;
}>();

const selectedItemRef = toRef(props, "selectedItem");

const {
  form,
  isProcessing,
  handleImageChange,
  removeCurrentImage,
  submit,
  resetForm,
  getPublicUrl,
} = useMenuItemForm(selectedItemRef);

const menuAdminStore = useTopMenuItemsStore();

async function onFormSubmit() {
  const success = await submit();
  if (success) {
    emit("form-saved");
  }
}

function onCancelClick() {
  resetForm();
  emit("form-cancel");
}
</script>

<template>
  <form
    @submit.prevent="onFormSubmit"
    class="space-y-6 bg-card p-6 rounded-lg shadow-md"
  >
    <h2 class="text-xl font-semibold mb-4 text-foreground">
      {{
        selectedItem
          ? `Редактирование подкатегории: ${selectedItem.title}`
          : "Создание новой подкатегории"
      }}
    </h2>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
      <div>
        <Label for="form-parent_slug">Родительский раздел *</Label>
        <Select v-model="form.parent_slug" required :disabled="!!selectedItem">
          <SelectTrigger id="form-parent_slug"
            ><SelectValue placeholder="Выберите раздел..."
          /></SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in menuAdminStore.parentSlugOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <p v-if="!!selectedItem" class="text-xs text-muted-foreground mt-1">
          Родителя существующего элемента нельзя изменить.
        </p>
      </div>

      <div>
        <Label for="form-title">Название подкатегории *</Label>
        <Input id="form-title" v-model="form.title" required />
      </div>

      <div>
        <Label for="form-slug">Слаг подкатегории *</Label>
        <Input
          id="form-slug"
          v-model="form.slug"
          required
          :disabled="!!selectedItem"
        />
        <p v-if="!!selectedItem" class="text-xs text-muted-foreground mt-1">
          Слаг нельзя изменить.
        </p>
      </div>

      <div>
        <Label for="form-href">Ссылка (URL) *</Label>
        <Input
          id="form-href"
          v-model="form.href"
          required
          placeholder="/catalog/parent/child"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Заполняется автоматически при вводе названия.
        </p>
      </div>

      <div>
        <Label for="form-display_order">Порядок отображения</Label>
        <Input
          id="form-display_order"
          type="number"
          v-model.number="form.display_order"
        />
      </div>

      <div>
        <!-- <Label for="form-icon_name">Имя иконки (Lucide)</Label>
        <Input
          id="form-icon_name"
          v-model="form.icon_name ?? ''"
          placeholder="например, 'toy-brick'"
        /> -->
      </div>
    </div>

    <div>
      <Label for="form-description">Описание подкатегории</Label>
      <Textarea id="form-description" v-model="form.description" rows="2" />
    </div>

    <div>
      <Label for="form-image">Изображение для подкатегории</Label>
      <Input
        id="form-image"
        type="file"
        @change="handleImageChange"
        accept="image/*"
      />
      <div
        v-if="form._imagePreviewUrl || form.image_url"
        class="mt-2 border p-2 rounded-md inline-block relative"
      >
        <img
          :src="
            form._imagePreviewUrl ||
            getPublicUrl(BUCKET_NAME, form.image_url!) ||
            undefined
          "
          alt="Превью"
          class="max-w-[150px] max-h-[80px] object-contain rounded"
        />
        <Button
          @click="removeCurrentImage"
          variant="destructive"
          size="icon"
          class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
          type="button"
          aria-label="Удалить изображение"
        >
          <Icon name="lucide:x" class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <div class="flex items-center gap-3 pt-4 border-t">
      <Button type="submit" :disabled="isProcessing">
        <Icon
          v-if="isProcessing"
          name="svg-spinners:ring-resize"
          class="mr-2 h-4 w-4"
        />
        {{
          isProcessing
            ? "Сохранение..."
            : selectedItem
              ? "Сохранить изменения"
              : "Создать подкатегорию"
        }}
      </Button>
      <Button
        v-if="selectedItem"
        @click="onCancelClick"
        variant="outline"
        type="button"
      >
        Отмена
      </Button>
    </div>
  </form>
</template>
