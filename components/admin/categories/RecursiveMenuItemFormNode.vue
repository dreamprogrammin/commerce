<script setup lang="ts">
import type { EditableCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME } from '@/constants'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  item: EditableCategory
  parentHref: string
  level: number
}>()

const emit = defineEmits<{
  (e: 'addChild', parentItem: EditableCategory): void
  (e: 'updateNode', updatedItem: EditableCategory): void
  (e: 'removeNode', itemToRemove: EditableCategory): void
}>()

const localItem = ref<EditableCategory>(JSON.parse(JSON.stringify(props.item)))

const RecursiveMenuItemFormNode = defineAsyncComponent(
  () => import('@/components/admin/categories/RecursiveMenuItemFormNode.vue'),
)

watch(localItem, (newItem) => {
  emit('updateNode', newItem)
}, { deep: true })

const isChildrenVisible = ref(true)
const { getPublicUrl } = useSupabaseStorage()

function autoFill() {
  // Автозаполнение работает только для НОВЫХ, еще не сохраненных элементов
  if (props.item._isNew && props.item.name) {
    const newSlug = slugify(props.item.name)
    props.item.slug = newSlug
    props.item.href = `${props.parentHref}/${newSlug}`
  }
}
function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    console.log('File selected:', target.files[0])
  }
}

function removeImage() {
  props.item.image_url = null
}
const descriptionValue = computed({
  // `get` будет вызываться, когда компонент читает значение
  get() {
    // Если item.description это null, мы возвращаем undefined.
    // Иначе, возвращаем само значение.
    return props.item.description ?? undefined
  },
  // `set` будет вызываться, когда пользователь что-то вводит в Textarea
  set(newValue) {
    // Если новое значение - пустая строка, мы сохраняем null в наши данные.
    // Иначе, сохраняем новую строку.
    props.item.description = newValue || null
  },
})
</script>

<template>
  <!--
    Обертка, которая делает "удаленные" элементы полупрозрачными и добавляет красную полоску слева.
    Это дает админу понять, что этот блок помечен на удаление.
  -->
  <div
    :class="{
      'opacity-50 border-l-2 border-destructive pl-4 transition-opacity':
        item._isDeleted,
    }"
  >
    <div
      class="border p-4 rounded-lg space-y-4 bg-muted/40 relative shadow-sm"
      :style="{ marginLeft: `${level * 25}px` }"
    >
      <!-- Блок с кнопками управления в правом верхнем углу -->
      <div class="absolute top-2 right-2 flex items-center gap-2 z-10">
        <!-- Кнопка "Восстановить" появляется, только если элемент помечен на удаление -->
        <Button
          v-if="item._isDeleted"
          variant="outline"
          size="sm"
          type="button"
          class="text-xs h-7 border-primary text-primary hover:bg-primary/10"
          @click="item._isDeleted = false"
        >
          Восстановить
        </Button>
        <!-- Кнопка "Удалить", которая теперь просто меняет флаг -->
        <Button
          v-else
          variant="ghost"
          size="icon"
          type="button"
          class="text-destructive hover:bg-destructive/10 h-7 w-7"
          aria-label="Пометить на удаление"
          @click="emit('remove-self')"
        >
          <!-- Иконка мусорной корзины -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z"
            />
          </svg>
        </Button>
      </div>

      <p class="font-medium text-sm text-foreground pr-16">
        Редактирование категории (Уровень {{ level + 2 }})
      </p>

      <!-- Основная форма с полями -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label :for="`name-${item._tempId || item.id}`">Название *</Label>
          <Input
            :id="`name-${item._tempId || item.id}`"
            v-model="item.name"
            required
            :disabled="item._isDeleted"
            @input="autoFill"
          />
        </div>
        <div>
          <Label :for="`slug-${item._tempId || item.id}`">Слаг (Slug) *</Label>
          <Input
            :id="`slug-${item._tempId || item.id}`"
            v-model="item.slug"
            required
            :disabled="item._isDeleted"
          />
        </div>
      </div>
      <div>
        <Label :for="`href-${item._tempId || item.id}`">Ссылка (URL) *</Label>
        <Input
          :id="`href-${item._tempId || item.id}`"
          v-model="item.href"
          required
          :disabled="item._isDeleted"
        />
      </div>
      <div>
        <Label :for="`desc-${item._tempId || item.id}`">Описание</Label>
        <Textarea
          :id="`desc-${item._tempId || item.id}`"
          v-model="descriptionValue"
          rows="2"
          placeholder="Краткое описание для SEO и меню..."
          :disabled="item._isDeleted"
        />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <Label :for="`order-${item._tempId || item.id}`">Порядок в меню</Label>
          <Input
            :id="`order-${item._tempId || item.id}`"
            v-model.number="item.display_order"
            type="number"
            :disabled="item._isDeleted"
          />
        </div>
        <div class="flex items-center space-x-2 pt-5">
          <Switch
            :id="`display-${item._tempId || item.id}`"
            v-model:checked="item.display_in_menu"
            :disabled="item._isDeleted"
          />
          <Label :for="`display-${item._tempId || item.id}`">Показывать в меню</Label>
        </div>
      </div>
      <div>
        <Label :for="`image-${item._tempId || item.id}`">Изображение для меню</Label>
        <Input
          :id="`image-${item._tempId || item.id}`"
          type="file"
          accept="image/png, image/jpeg, image/webp"
          :disabled="item._isDeleted"
          @change="handleImageChange"
        />
        <div
          v-if="item.image_url"
          class="mt-2 border p-2 rounded-md inline-block relative bg-background"
        >
          <img
            :src="getPublicUrl(BUCKET_NAME, item.image_url!) || undefined"
            :alt="`Изображение для ${item.name}`"
            class="max-w-[150px] max-h-[80px] object-contain rounded"
          >
          <Button
            variant="destructive"
            size="icon"
            class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            type="button"
            aria-label="Удалить изображение"
            :disabled="item._isDeleted"
            @click="removeImage"
          >
            <!-- Иконка крестика -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
            >
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
              />
            </svg>
          </Button>
        </div>
      </div>

      <!-- Рекурсивный блок для дочерних элементов -->
      <div
        v-if="item.children && item.children.length > 0"
        class="pt-3 mt-3 border-t"
      >
        <div class="flex items-center justify-between">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Подкатегории для "{{ item.name }}" ({{
              item.children.filter((c) => !c._isDeleted).length
            }}
            шт.)
          </h4>
          <Button
            size="sm"
            variant="ghost"
            @click="isChildrenVisible = !isChildrenVisible"
          >
            {{ isChildrenVisible ? "Свернуть" : "Развернуть" }}
          </Button>
        </div>

        <div v-if="isChildrenVisible" class="mt-2 space-y-3">
          <RecursiveCategoryFormNode
            v-for="child in item.children"
            :key="child.id || child._tempId!"
            :item="child"
            :parent-href="item.href || ''"
            :level="level + 1"
            @add-child="(parent: EditableCategory) => emit('addChild', parent)"
            @remove-self="child._isDeleted = true"
          />
        </div>
      </div>

      <!-- Кнопка "Добавить подкатегорию" -->
      <Button
        size="sm"
        variant="outline"
        class="mt-2 border-dashed w-full"
        :disabled="item._isDeleted"
        @click="emit('addChild', item)"
      >
        Добавить подкатегорию в "{{ item.name }}" (Уровень {{ level + 3 }})
      </Button>
    </div>
  </div>
</template>
