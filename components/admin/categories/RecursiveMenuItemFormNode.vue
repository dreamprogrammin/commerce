<script setup lang="ts">
import type { EditableCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  item: EditableCategory
  parentHref: string
  level: number
}>()

const emit = defineEmits<{
  (e: 'update:item', value: EditableCategory): void
  (e: 'addChild', parentItem: EditableCategory): void
  (e: 'removeChild', itemToRemove: EditableCategory): void
  (e: 'removeSelf'): void
}>()

const RecursiveCategoryFormNode = defineAsyncComponent(
  () => import('@/components/admin/categories/RecursiveMenuItemFormNode.vue'),
)

const isChildrenVisible = ref(true)
const { getPublicUrl } = useSupabaseStorage()

const name = computed({
  get: () => props.item.name,
  set: (value) => {
    const updatedItem = { ...props.item, name: value }
    if (props.item._isNew) { // Автозаполнение при изменении имени
      const newSlug = slugify(value)
      updatedItem.slug = newSlug
      updatedItem.href = `${props.parentHref}/${newSlug}`
    }
    emit('update:item', updatedItem)
  },
})
const slug = computed({
  get: () => props.item.slug,
  set: value => emit('update:item', { ...props.item, slug: value }),
})
const href = computed({
  get: () => props.item.href,
  set: value => emit('update:item', { ...props.item, href: value }),
})
const description = computed({
  get: () => props.item.description ?? '',
  set: value => emit('update:item', { ...props.item, description: value || null }),
})
const display_order = computed({
  get: () => props.item.display_order,
  set: value => emit('update:item', { ...props.item, display_order: value }),
})
const display_in_menu = computed({
  get: () => props.item.display_in_menu,
  set: value => emit('update:item', { ...props.item, display_in_menu: value }),
})
const isDeleted = computed({
  get: () => props.item._isDeleted || false,
  set: value => emit('update:item', { ...props.item, _isDeleted: value }),
})

function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('update:item', {
      ...props.item,
      _imageFile: file,
      _imagePreview: URL.createObjectURL(file),
      image_url: null,
    })
  }
}

function removeImage() {
  emit('update:item', {
    ...props.item,
    _imageFile: undefined,
    _imagePreview: undefined,
    image_url: null,
  })
}
// function handleChildRemove(itemToRemove: EditableCategory) {
//   const targetId = itemToRemove.id || itemToRemove._tempId
//   const index = localItem.value.children.findIndex(item => (item.id || item._tempId) === targetId)

//   if (index !== -1) {
//     const nodeToModify = localItem.value.children[index]
//     if (nodeToModify) {
//       if (nodeToModify.id) {
//         nodeToModify._isDeleted = true
//       }
//       else {
//         localItem.value.children.splice(index, 1)
//       }
//     }
//   }
// }

// function autoFill() {
//   if (localItem.value._isNew && localItem.value.name) {
//     const newSlug = slugify(localItem.value.name)
//     localItem.value.slug = newSlug
//     localItem.value.href = `${props.parentHref}/${newSlug}`
//   }
// }
// function handleImageChange(event: Event) {
//   const target = event.target as HTMLInputElement
//   const file = target.files?.[0]
//   if (file) {
//     localItem.value._imageFile = file
//     localItem.value._imagePreview = URL.createObjectURL(file)
//     localItem.value.image_url = null
//   }
// }

// function removeImage() {
//   localItem.value._imageFile = undefined
//   localItem.value._imagePreview = undefined
//   localItem.value.image_url = null
// }
// const descriptionValue = computed({
//   get() {
//     return props.item.description ?? undefined
//   },
//   set(newValue) {
//     localItem.value.description = newValue || null
//   },
// })

// function handleChildUpdate(updatedChild: EditableCategory) {
//   const index = localItem.value.children.findIndex(c => (c.id || c._tempId) === (updatedChild.id || updatedChild._tempId))
//   if (index !== -1) {
//     localItem.value.children[index] = updatedChild
//   }
// }
</script>

<template>
  <div :class="{ 'opacity-50 border-l-2 border-destructive pl-4 transition-opacity': isDeleted }">
    <div
      class="border p-4 rounded-lg space-y-4 bg-muted/40 relative shadow-sm"
      :style="{ marginLeft: `${level * 25}px` }"
    >
      <div class="absolute top-2 right-2 flex items-center gap-2 z-10">
        <Button
          v-if="isDeleted"
          variant="outline"
          size="sm" type="button" class="text-xs h-7 border-primary text-primary hover:bg-primary/10"
          @click="isDeleted = false"
        >
          Восстановить
        </Button>
        <Button
          v-else
          variant="ghost"
          size="icon" type="button" class="text-destructive hover:bg-destructive/10 h-7 w-7"
          aria-label="Пометить на удаление"
          @click="emit('removeSelf')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z" /></svg>
        </Button>
      </div>

      <p class="font-medium text-sm text-foreground pr-16">
        Редактирование категории (Уровень {{ level + 2 }})
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label :for="`name-${props.item._tempId || props.item.id}`">Название *</Label>
          <Input :id="`name-${props.item._tempId || props.item.id}`" v-model="name" required :disabled="isDeleted" />
        </div>
        <div>
          <Label :for="`slug-${props.item._tempId || props.item.id}`">Слаг (Slug) *</Label>
          <Input :id="`slug-${props.item._tempId || props.item.id}`" v-model="slug" required :disabled="isDeleted" />
        </div>
      </div>
      <div>
        <Label :for="`href-${props.item._tempId || props.item.id}`">Ссылка (URL) *</Label>
        <Input :id="`href-${props.item._tempId || props.item.id}`" v-model="href" required :disabled="isDeleted" />
      </div>
      <div>
        <Label :for="`desc-${props.item._tempId || props.item.id}`">Описание</Label>
        <Textarea :id="`desc-${props.item._tempId || props.item.id}`" v-model="description" rows="2" placeholder="Краткое описание для SEO и меню..." :disabled="isDeleted" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <Label :for="`order-${props.item._tempId || props.item.id}`">Порядок в меню</Label>
          <Input :id="`order-${props.item._tempId || props.item.id}`" v-model.number="display_order" type="number" :disabled="isDeleted" />
        </div>
        <div class="flex items-center space-x-2 pt-5">
          <Switch :id="`display-${props.item._tempId || props.item.id}`" v-model:model-value="display_in_menu" :disabled="props.item._isDeleted" />
          <Label :for="`display-${props.item._tempId || props.item.id}`">Показывать в меню</Label>
        </div>
      </div>
      <div>
        <Label :for="`image-${props.item._tempId || props.item.id}`">Изображение для меню</Label>
        <Input :id="`image-${props.item._tempId || props.item.id}`" type="file" accept="image/png, image/jpeg, image/webp" :disabled="isDeleted" @change="handleImageChange" />
        <div v-if="props.item._imagePreview || props.item.image_url" class="mt-2 border p-2 rounded-md inline-block relative bg-background">
          <NuxtImg :src="props.item._imagePreview || getPublicUrl(BUCKET_NAME_CATEGORY, props.item.image_url!) || undefined" :alt="`Изображение для ${props.item.name}`" class="max-w-[150px] max-h-[80px] object-contain rounded" placeholder quality="85" format="webp" />
          <Button variant="destructive" size="icon" class="absolute -top-2 -right-2 h-6 w-6 rounded-full" type="button" aria-label="Удалить изображение" :disabled="isDeleted" @click="removeImage">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z" /></svg>
          </Button>
        </div>
      </div>

      <div v-if="props.item.children && props.item.children.length > 0" class="pt-3 mt-3 border-t">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold text-sm text-muted-foreground">
            Подкатегории для "{{ props.item.name }}" ({{ props.item.children.filter(c => !c._isDeleted).length }} шт.)
          </h4>
          <Button size="sm" variant="ghost" @click="isChildrenVisible = !isChildrenVisible">
            {{ isChildrenVisible ? "Свернуть" : "Развернуть" }}
          </Button>
        </div>
        <div v-if="isChildrenVisible" class="mt-2 space-y-3">
          <RecursiveCategoryFormNode
            v-for="(child, index) in props.item.children"
            :key="child.id || child._tempId!"
            :item="child"
            :parent-href="props.item.href || ''"
            :level="level + 1"
            @add-child="emit('addChild', $event)"
            @remove-self="emit('removeChild', child)"
            @remove-child="emit('removeChild', $event)"
            @update:item="(updatedChild) => {
              const newChildren = [...props.item.children]
              newChildren[index] = updatedChild
              emit('update:item', { ...props.item, children: newChildren })
            }"
          />
        </div>
      </div>

      <Button size="sm" variant="outline" class="mt-2 border-dashed w-full" :disabled="isDeleted" @click="emit('addChild', props.item)">
        Добавить подкатегорию в "{{ props.item.name }}" (Уровень {{ level + 3 }})
      </Button>
    </div>
  </div>
</template>
