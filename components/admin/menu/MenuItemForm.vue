<script setup lang="ts">
import { useMenuItemFormData } from "~/composables/menuItems/useMenuItemsForm";
import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "~/components/ui/select";
import type { MenuItemRow } from "~/types";

const props = defineProps<{
  selectedItem: MenuItemRow | null;
}>();

const emit = defineEmits<{
  (e: "form-saved"): null;
  (e: "form-cancel"): null;
}>();

const selectedItemRef = toRef(props, "selectedItem");

const {
  form,
  imagePreviewUrl,
  isProcessing,
  handleImageFileChange,
  removeCurrentImage,
  submitForm,
  resetFormFields,
} = useMenuItemFormData(selectedItemRef);

const formHref = computed({
  get: () => form.value.href ?? "",
  set: (val) => {
    form.value.href = val === "" ? null : val;
  },
});

const formDescription = computed({
  get: () => form.value.description ?? "",
  set: (val) => (form.value.description = val === "" ? null : val),
});

const formIconName = computed({
  get: () => form.value.icon_name ?? "",
  set: (val) => (form.value.icon_name = val === "" ? null : val),
});

const menuItemsStore = useMenuItems();

async function onFormSubmit() {
  console.log("gu");
  const success = await submitForm();
  if (success) {
    emit("form-saved");
    console.log("click");
  }
}

function onCancelClick() {
  resetFormFields();
  emit("form-cancel");
  console.log("click");
}
</script>
<template>
  <form
    @submit.prevent="onFormSubmit"
    class="space-y-4 bg-card p-6 rounded-lg shadow-md"
  >
    <h2 class="text-xl font-semibold mb-4 text-foreground">
      {{
        selectedItem
          ? `Редактирование : ${selectedItem.title}`
          : `Создание нового пункта`
      }}
    </h2>

    <div>
      <Label
        for="form-title"
        class="block text-sm font-medium text-foreground mb-1"
        >Заголовок *</Label
      >
      <Input id="form-title" v-model="form.title" required />
      {{ form.title }}
    </div>

    <div>
      <Label
        for="form-slug"
        class="block text-sm font-medium text-foreground mb-1"
        >Слаг (Уникальный, латиницей) *</Label
      >
      <Input
        id="form-slug"
        v-model="form.slug"
        required
        :disabled="!!selectedItem"
      />
      <p v-if="!!selectedItem" class="text-xs text-muted-foreground mt-1">
        Слаг существующего элемента нельзя изменять
      </p>
    </div>

    <div>
      <Label
        for="form-href"
        class="block text-sm font-medium text-foreground mb-1"
        >Ссылка (URL)</Label
      >
      <Input
        id="form-href"
        v-model="formHref"
        required
        placeholder="/например/категория"
      />
    </div>

    <div>
      <Label
        for="form-item_type"
        class="block text-sm font-medium text-foreground mb-1"
        >Тип пункта*</Label
      >
      <Select v-model="form.item_type" required>
        <SelectTrigger id="form-item_type"
          ><SelectValue placeholder="Выберите тип..."
        /></SelectTrigger>
        <SelectContent>
          <SelectItem value="link">Ссылка</SelectItem>
          <SelectItem value="trigger">Выпадающий список (не ссылка)</SelectItem>
          <SelectItem value="trigger_and_link"
            >Ссылка и выпадающий список</SelectItem
          >
        </SelectContent>
      </Select>
    </div>

    <div>
      <Label
        for="form-parent_slug"
        class="block text-sm font-medium text-foreground mb-1"
        >Родительский пункт</Label
      >
      <Select v-model="form.parent_slug">
        <SelectTrigger id="form-parent_slug"
          ><SelectValue placeholder="Выберите родителя..."
        /></SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in menuItemsStore.parentSlugOptions"
            :key="option.value || 'null-parent-option'"
            :value="option.value!"
          >
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div>
      <Label
        for="form-display_order"
        class="block text-sm font-medium text-foreground mb-1"
        >Порядок отображения</Label
      >
      <Input
        id="form-display_order"
        type="number"
        v-model="form.display_order"
      />
    </div>

    <div>
      <Label
        for="form-icon_name"
        class="block text-sm font-medium text-foreground mb-1"
        >Имя иконки (Lucide)</Label
      >
      <Input
        id="form-icon_name"
        v-model="formIconName"
        placeholder="например, 'home', 'settings'"
      />
    </div>

    <div>
      <Label
        for="form-image"
        class="block text-sm font-medium text-foreground mb-1"
        >Изображение для выпадающего списка</Label
      >
      <Input
        id="form-image"
        type="file"
        @change="handleImageFileChange"
        accept="image/png, image/jpeg, image/webp, image/gif"
      />
      <div
        v-if="imagePreviewUrl"
        class="mt-2 border p-2 rounded-md inline-block relative"
      >
        <p class="text-xs text-muted-foreground mb-1">Предпросмотр:</p>
        <img
          :src="imagePreviewUrl"
          alt="Предпросмотр"
          class="max-w-[200px] max-h-[100px] object-contain rounded"
        />
        <Button
          v-if="form.image_url || imagePreviewUrl"
          @click="removeCurrentImage"
          variant="destructive"
          size="icon"
          class="absolute top-1 right-1 h-6 w-6"
          type="button"
          aria-label="Удалить изображение"
        >
          Удалить изображение
        </Button>
      </div>
      <p
        v-else-if="form.image_url && !imagePreviewUrl"
        class="text-sm text-muted-foreground mt-1"
      >
        Текущее изображение: {{ form.image_url.split("/").pop() }}
        <Button
          @click="removeCurrentImage"
          variant="link"
          size="sm"
          class="text-destructive p-0 h-auto ml-2"
          type="button"
        >
          Удалить
        </Button>
      </p>
    </div>

    <div class="flex items-center gap-3 pt-4">
      <Button type="submit" :disabled="isProcessing">
        <!-- <Icon
          v-if="isProcessing"
          name="svg-spinners:ring-resize"
          class="mr-2 h-4 w-4"
        /> -->
        {{
          isProcessing
            ? "Обработка..."
            : selectedItem
              ? "Сохранить изменения"
              : "Создать пункт"
        }}
      </Button>
      <Button
        v-if="selectedItem"
        @click="onCancelClick"
        variant="outline"
        type="button"
      >
        Отмена (создать новый)
      </Button>
    </div>
  </form>
</template>
