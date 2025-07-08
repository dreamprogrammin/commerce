<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IEditableMenuItem } from "~/types";
import { useSupabaseStorage } from "~/composables/menuItems/useSupabaseStorage";
import { BUCKET_NAME } from "~/constants";

const props = defineProps<{
  item: IEditableMenuItem;
  parentHref: string;
  level: number;
}>();

const emit = defineEmits<{
  (e: "add-child", parentItem: IEditableMenuItem): void;
  (e: "remove-self"): void;
}>();

const RecursiveMenuItemFormNode = defineAsyncComponent(
  () => import("~/components/admin/menu/RecursiveMenuItemFormNode.vue"),
);

const isChildrenVisible = ref(true);

const { getPublicUrl } = useSupabaseStorage();

function autoFillTitle() {
  if (!props.item.id && props.item.title) {
    const newSlugPart = slugify(props.item.title);
    props.item.slug = `${props.item.parent_slug}-${newSlugPart}`;
    props.item.href = `${props.parentHref}/${newSlugPart}`;
  }
}

function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    props.item._imageFile = target.files[0];
    props.item._imagePreviewUrl = URL.createObjectURL(target.files[0]);
  }
}

function removeImage() {
  props.item._imageFile = null;
  props.item._imagePreviewUrl = undefined;
  if (props.item.image_url) {
    props.item.image_url = null;
  }
}
</script>

<template>
  <div
    class="border p-4 rounded-lg space-y-4 bg-muted/40 relative shadow-sm"
    :style="{ marginLeft: `${level * 25}px` }"
  >
    <Button
      @click="emit('remove-self')"
      variant="ghost"
      size="icon"
      type="button"
      class="absolute top-2 right-2 text-destructive hover:bg-destructive/10 h-7 w-7 z-10"
      aria-label="Удалить этот подпункт"
    >
    </Button>

    <p class="font-medium text-sm text-foreground pr-8">
      Редактирование подпункта (Уровень {{ level + 2 }})
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
      <div>
        <Label :for="`title-${item._tempId || item.id}`">Заголовок *</Label>
        <Input
          :id="`title-${item._tempId || item.id}`"
          v-model="item.title"
          @input="autoFillTitle"
          required
        />
      </div>
      <div>
        <Label :for="`slug-${item._tempId || item.id}`">Слаг *</Label>
        <Input
          :id="`slug-${item._tempId || item.id}`"
          v-model="item.slug"
          required
          :disabled="!!item.id"
        />
      </div>
    </div>
    <div>
      <Label :for="`href-${item._tempId || item.id}`">Ссылка *</Label>
      <Input
        :id="`href-${item._tempId || item.id}`"
        v-model="item.href"
        required
        :disabled="!!item.id"
      />
    </div>
    <div>
      <Label :for="`desc-${item._tempId || item.id}`">Описание</Label>
      <Textarea
        :id="`desc-${item._tempId || item.id}`"
        v-model="item.description"
        rows="2"
        class="w-full mt-1"
      />
    </div>
    <div>
      <Label :for="`order-${item._tempId || item.id}`">Порядок</Label>
      <Input
        :id="`order-${item._tempId || item.id}`"
        type="number"
        v-model.number="item.display_order"
      />
    </div>
    <div>
      <Label :for="`image-${item._tempId || item.id}`">Изображение</Label>
      <Input
        :id="`image-${item._tempId || item.id}`"
        type="file"
        @change="handleImageChange"
        accept="image/*"
        class="w-full"
      />
      <div
        v-if="item._imagePreviewUrl || item.image_url"
        class="mt-2 border p-2 rounded-md inline-block relative"
      >
        <img
          :src="
            item._imagePreviewUrl ||
            getPublicUrl(BUCKET_NAME, item.image_url!) ||
            undefined
          "
          alt="Превью"
          class="max-w-[150px] max-h-[80px] object-contain rounded"
        />
        <Button
          @click="removeImage"
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

    <div
      class="pt-3 mt-3 border-t"
      v-if="item.children && item.children.length > 0"
    >
      <div class="flex items-center justify-between">
        <h4 class="font-semibold text-sm text-muted-foreground">
          Под-подпункты для "{{ item.title }}" ({{ item.children.length }} шт.)
        </h4>
        <Button
          @click="isChildrenVisible = !isChildrenVisible"
          size="sm"
          variant="ghost"
        >
          {{ isChildrenVisible ? "Свернуть" : "Развернуть" }}
          <Icon
            name="lucide:chevron-down"
            :class="{ 'rotate-180': !isChildrenVisible }"
            class="ml-1 h-4 w-4 transition-transform"
          />
        </Button>
      </div>

      <div v-if="isChildrenVisible" class="mt-2 space-y-3">
        <RecursiveMenuItemFormNode
          v-for="(child, index) in item.children"
          :key="child.id || child._tempId!"
          :item="child"
          :parent-href="item.href || ''"
          :level="level + 1"
          @add-child="(parent) => emit('add-child', parent)"
          @remove-self="item.children.splice(index, 1)"
        />
      </div>
    </div>

    <!-- Кнопка "Создать подменю для 'Машинки'" -->
    <Button
      @click="emit('add-child', item)"
      size="sm"
      variant="outline"
      class="mt-2 border-dashed w-full"
    >
      <Icon name="lucide:plus" class="mr-1 h-4 w-4" /> Добавить подпункт
      (Уровень {{ level + 3 }})
    </Button>
  </div>
</template>
