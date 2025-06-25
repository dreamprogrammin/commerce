<script setup lang="ts">
import { toRef } from "vue";
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
import { useMenuItemFormData } from "~/composables/menuItems/useMenuItemsForm";
import { useMenuItems } from "~/stores/menuItems/useMenuItems";

type MenuItemRow = Database["public"]["Tables"]["menu_items"]["Row"];

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
  childrenForms,
  addChild,
  removeChild,
  isProcessing,
  handleItemChange,
  removeItemImage,
  submitForm,
  resetFormFields,
  getStoragePublicUrl,
} = useMenuItemFormData(selectedItemRef);

const menuItemsStore = useMenuItems();

const formHref = computed({
  get: () => form.value.href ?? "",
  set: (value) => (form.value.href = value === "" ? null : value),
});

const formIcon_name = computed({
  get: () => form.value.icon_name ?? "",
  set: (value) => (form.value.icon_name = value === "" ? null : ""),
});

async function onFormSubmit() {
  const success = await submitForm();
  if (success) {
    emit("form-saved");
  }
}

function onCancelClick() {
  resetFormFields();
  emit("form-cancel");
}
</script>

<template>
  <form
    @submit.prevent="onFormSubmit"
    class="space-y-6 bg-card p-6 rounded-lg shadow-md"
  >
    <!-- === Секция для основного пункта меню === -->
    <div>
      <h2 class="text-xl font-semibold mb-1 text-foreground">
        {{
          selectedItem
            ? `Редактирование: ${form.title || selectedItem.title}`
            : "Создание нового пункта меню"
        }}
      </h2>
      <p class="text-sm text-muted-foreground mb-4">
        Основная информация о пункте меню.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label for="main-title">Заголовок *</Label>
          <Input id="main-title" v-model="form.title" required />
        </div>
        <div>
          <Label for="main-slug">Слаг (уникальный, латиницей) *</Label>
          <Input
            id="main-slug"
            v-model="form.slug"
            required
            :disabled="!!selectedItem"
          />
          <p v-if="!!selectedItem" class="text-xs text-muted-foreground mt-1">
            Слаг существующего элемента нельзя изменить.
          </p>
        </div>
        <div>
          <Label for="main-href">Ссылка (URL)</Label>
          <Input
            id="main-href"
            v-model="formHref"
            placeholder="/catalog/category"
          />
        </div>
        <div>
          <Label for="main-item_type">Тип пункта *</Label>
          <Select v-model="form.item_type" required>
            <SelectTrigger id="main-item_type"
              ><SelectValue placeholder="Выберите тип..."
            /></SelectTrigger>
            <SelectContent>
              <SelectItem value="link">Ссылка</SelectItem>
              <SelectItem value="trigger"
                >Выпадающий список (не ссылка)</SelectItem
              >
              <SelectItem value="trigger_and_link"
                >Ссылка и выпадающий список</SelectItem
              >
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label for="main-parent_slug"
            >Родительский пункт (для этого пункта)</Label
          >
          <Select v-model="form.parent_slug">
            <SelectTrigger id="main-parent_slug"
              ><SelectValue placeholder="Выберите родителя..."
            /></SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="option in menuItemsStore.parentSlugOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label for="main-display_order">Порядок отображения</Label>
          <Input
            id="main-display_order"
            type="number"
            v-model.number="form.display_order"
          />
        </div>
        <div>
          <Label for="main-icon_name">Имя иконки (Lucide)</Label>
          <Input
            id="main-icon_name"
            v-model="formIcon_name"
            placeholder="home, settings"
          />
        </div>
      </div>
      <div class="mt-4">
        <Label for="main-image"
          >Изображение для основного пункта (если тип 'link' и это
          подкатегория)</Label
        >
        <Input
          id="main-image"
          type="file"
          @change="handleItemChange($event, form)"
          accept="image/*"
        />
        <div
          v-if="form._imagePreviewUrl || form.image_url"
          class="mt-2 border p-2 rounded-md inline-block relative"
        >
          <p class="text-xs text-muted-foreground mb-1">Предпросмотр:</p>
          <img
            :src="form._imagePreviewUrl ?? undefined"
            alt="Превью"
            class="max-w-[150px] max-h-[80px] object-contain rounded"
          />
          <Button
            @click="removeItemImage(form)"
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
    </div>

    <!-- === Секция для дочерних элементов (второй уровень относительно mainForm) === -->
    <div class="pt-6 border-t mt-6">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-lg font-semibold text-foreground">
          Подпункты для "{{ form.title || "нового пункта" }}"
        </h3>
        <Button @click="addChild" variant="outline" size="sm" type="button">
          Добавить подпункт
        </Button>
      </div>

      <div
        v-if="childrenForms.length === 0"
        class="text-sm text-muted-foreground py-4 text-center border-dashed border-2 rounded-md"
      >
        Нет подпунктов. Нажмите "Добавить подпункт", чтобы создать.
      </div>

      <div
        v-for="(childForm, index) in childrenForms"
        :key="childForm.id || childForm._tempId!"
        class="border p-4 rounded-md mb-4 space-y-3 bg-muted/30 relative shadow-sm"
      >
        <Button
          @click="removeChild(childForm._tempId || index)"
          variant="ghost"
          size="icon"
          type="button"
          class="absolute top-2 right-2 text-destructive hover:bg-destructive/10 h-7 w-7 z-10"
          aria-label="Удалить этот подпункт"
        >
          Удалить
        </Button>
        <p class="font-medium text-sm text-foreground">
          Подпункт #{{ index + 1 }}
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <Label :for="`child-title-${childForm._tempId || index}`"
              >Заголовок *</Label
            >
            <Input
              :id="`child-title-${childForm._tempId || index}`"
              v-model="childForm.title"
              required
            />
          </div>
          <div>
            <Label :for="`child-slug-${childForm._tempId || index}`"
              >Слаг * (уникальный в рамках родителя)</Label
            >
            <Input
              :id="`child-slug-${childForm._tempId || index}`"
              v-model="childForm.slug"
              required
              :disabled="!!childForm.id"
            />
          </div>
          <div>
            <Label :for="`child-href-${childForm._tempId || index}`"
              >Ссылка</Label
            >
            <Input
              :id="`child-href-${childForm._tempId || index}`"
              v-model="childForm.href"
            />
          </div>
          <div>
            <Label :for="`child-item_type-${childForm._tempId || index}`"
              >Тип</Label
            >
            <Select v-model="childForm.item_type" required>
              <SelectTrigger
                :id="`child-item_type-${childForm._tempId || index}`"
                ><SelectValue placeholder="Тип подпункта..."
              /></SelectTrigger>
              <SelectContent>
                <SelectItem value="link">Ссылка (конечный пункт)</SelectItem>
                <SelectItem value="trigger"
                  >Выпадающий список (3й уровень, не ссылка)</SelectItem
                >
                <SelectItem value="trigger_and_link"
                  >Ссылка и список (3й уровень)</SelectItem
                >
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label :for="`child-description-${childForm._tempId || index}`"
            >Описание</Label
          >
          <Textarea
            :id="`child-description-${childForm._tempId || index}`"
            v-model="childForm.description"
            rows="2"
          />
        </div>
        <div>
          <Label :for="`child-display_order-${childForm._tempId || index}`"
            >Порядок</Label
          >
          <Input
            :id="`child-display_order-${childForm._tempId || index}`"
            type="number"
            v-model.number="childForm.display_order"
          />
        </div>
        <div>
          <Label :for="`child-image-${childForm._tempId || index}`"
            >Изображение для подпункта</Label
          >
          <Input
            :id="`child-image-${childForm._tempId || index}`"
            type="file"
            @change="handleItemChange($event, childForm)"
            accept="image/*"
          />
          <div
            v-if="childForm._imagePreviewUrl || childForm.image_url"
            class="mt-2 border p-2 rounded-md inline-block relative"
          >
            <img
              :src="childForm._imagePreviewUrl ?? undefined"
              alt="Превью"
              class="max-w-[120px] max-h-[70px] object-contain rounded"
            />
            <Button
              @click="removeItemImage(childForm)"
              variant="destructive"
              size="icon"
              class="absolute -top-2 -right-2 h-5 w-5 rounded-full"
              type="button"
              aria-label="Удалить изображение"
            >
              <Icon name="lucide:x" class="h-3 w-3" />
            </Button>
          </div>
        </div>
        <!-- Если childForm.item_type это trigger или trigger_and_link, здесь можно рекурсивно отобразить форму для его детей -->
      </div>
    </div>

    <div class="flex items-center gap-3 pt-6 border-t mt-6">
      <Button type="submit" :disabled="isProcessing">
        <Icon
          v-if="isProcessing"
          name="svg-spinners:ring-resize"
          class="mr-2 h-4 w-4"
        />
        {{
          isProcessing
            ? "Обработка..."
            : selectedItem
              ? "Сохранить все изменения"
              : "Создать пункт и подпункты"
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
