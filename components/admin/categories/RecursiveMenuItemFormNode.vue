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

const RecursiveCategoryFormNode = defineAsyncComponent(
  () => import('@/components/admin/categories/RecursiveMenuItemFormNode.vue'),
)

const isChildrenVisible = ref(true)
const { getPublicUrl } = useSupabaseStorage()

watch(localItem, (newItem) => {
  emit('updateNode', newItem)
}, { deep: true })

function autoFill() {
  if (localItem.value._isNew && localItem.value.name) {
    const newSlug = slugify(localItem.value.name)
    localItem.value.slug = newSlug
    localItem.value.href = `${props.parentHref}/${newSlug}`
  }
}
function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    localItem.value._imageFile = file
    localItem.value._imagePreview = URL.createObjectURL(file)
    localItem.value.image_url = null
  }
}

function removeImage() {
  localItem.value._imageFile = undefined
  localItem.value._imagePreview = undefined
  localItem.value.image_url = null
}
const descriptionValue = computed({
  get() {
    return props.item.description ?? undefined
  },
  set(newValue) {
    localItem.value.description = newValue || null
  },
})

function handleChildUpdate(updatedChild: EditableCategory) {
  const index = localItem.value.children.findIndex(c => (c.id || c._tempId) === (updatedChild.id || updatedChild._tempId))
  if (index !== -1) {
    localItem.value.children[index] = updatedChild
  }
}
</script>

<template>
  <div :class="{ 'opacity-50 border-l-2 border-destructive pl-4 transition-opacity': localItem._isDeleted }">
    <div
      class="border p-4 rounded-lg space-y-4 bg-muted/40 relative shadow-sm"
      :style="{ marginLeft: `${level * 25}px` }"
    >
      <div class="absolute top-2 right-2 flex items-center gap-2 z-10">
        <Button
          v-if="localItem._isDeleted"
          variant="outline"
          size="sm" type="button" class="text-xs h-7 border-primary text-primary hover:bg-primary/10"
          @click="localItem._isDeleted = false"
        >
          Восстановить
        </Button>
        <Button
          v-else
          variant="ghost"
          size="icon" type="button" class="text-destructive hover:bg-destructive/10 h-7 w-7"
          aria-label="Пометить на удаление"
          @click="emit('removeNode', localItem)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z" /></svg>
        </Button>
      </div>

      <p class="font-medium text-sm text-foreground pr-16">
        Редактирование категории (Уровень {{ level + 2 }})
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label :for="`name-${localItem._tempId || localItem.id}`">Название *</Label>
          <Input :id="`name-${localItem._tempId || localItem.id}`" v-model="localItem.name" required :disabled="localItem._isDeleted" @input="autoFill" />
        </div>
        <div>
          <Label :for="`slug-${localItem._tempId || localItem.id}`">Слаг (Slug) *</Label>
          <Input :id="`slug-${localItem._tempId || localItem.id}`" v-model="localItem.slug" required :disabled="localItem._isDeleted" />
        </div>
      </div>
      <div>
        <Label :for="`href-${localItem._tempId || localItem.id}`">Ссылка (URL) *</Label>
        <Input :id="`href-${localItem._tempId || localItem.id}`" v-model="localItem.href" required :disabled="localItem._isDeleted" />
      </div>
      <div>
        <Label :for="`desc-${localItem._tempId || localItem.id}`">Описание</Label>
        <Textarea :id="`desc-${localItem._tempId || localItem.id}`" v-model="descriptionValue" rows="2" placeholder="Краткое описание для SEO и меню..." :disabled="localItem._isDeleted" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <Label :for="`order-${localItem._tempId || localItem.id}`">Порядок в меню</Label>
          <Input :id="`order-${localItem._tempId || localItem.id}`" v-model.number="localItem.display_order" type="number" :disabled="localItem._isDeleted" />
        </div>
        <div class="flex items-center space-x-2 pt-5">
          <Switch :id="`display-${localItem._tempId || localItem.id}`" v-model:checked="localItem.display_in_menu" :disabled="localItem._isDeleted" />
          <Label :for="`display-${localItem._tempId || localItem.id}`">Показывать в меню</Label>
        </div>
      </div>
      <div>
        <Label :for="`image-${localItem._tempId || localItem.id}`">Изображение для меню</Label>
        <Input :id="`image-${localItem._tempId || localItem.id}`" type="file" accept="image/png, image/jpeg, image/webp" :disabled="localItem._isDeleted" @change="handleImageChange" />
        <div v-if="localItem._imagePreview || localItem.image_url" class="mt-2 border p-2 rounded-md inline-block relative bg-background">
          <img :src="localItem._imagePreview || getPublicUrl(BUCKET_NAME, localItem.image_url!) || undefined" :alt="`Изображение для ${localItem.name}`" class="max-w-[150px] max-h-[80px] object-contain rounded">
          <Button variant="destructive" size="icon" class="absolute -top-2 -right-2 h-6 w-6 rounded-full" type="button" aria-label="Удалить изображение" :disabled="localItem._isDeleted" @click="removeImage">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z" /></svg>
          </Button>
        </div>
      </div>

      <div v-if="localItem.children && localItem.children.length > 0" class="pt-3 mt-3 border-t">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Подкатегории для "{{ localItem.name }}" ({{ localItem.children.filter(c => !c._isDeleted).length }} шт.)
          </h4>
          <Button size="sm" variant="ghost" @click="isChildrenVisible = !isChildrenVisible">
            {{ isChildrenVisible ? "Свернуть" : "Развернуть" }}
          </Button>
        </div>
        <div v-if="isChildrenVisible" class="mt-2 space-y-3">
          <RecursiveCategoryFormNode
            v-for="child in localItem.children"
            :key="child.id || child._tempId!"
            :item="child"
            :parent-href="localItem.href || ''"
            :level="level + 1"
            @add-child="(parent: EditableCategory) => emit('addChild', parent)"
            @remove-node="emit('removeNode', child)"
            @update-node="handleChildUpdate"
          />
        </div>
      </div>

      <Button size="sm" variant="outline" class="mt-2 border-dashed w-full" :disabled="localItem._isDeleted" @click="emit('addChild', localItem)">
        Добавить подкатегорию в "{{ localItem.name }}" (Уровень {{ level + 3 }})
      </Button>
    </div>
  </div>
</template>
