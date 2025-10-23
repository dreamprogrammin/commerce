<script setup lang="ts">
import type { BrandInsert, BrandUpdate } from '@/types'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  initialData?: BrandInsert | BrandUpdate | null
  initialName?: string // Для автозаполнения из комбобокса
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { data: BrandInsert | BrandUpdate, file: File | null }): void
}>()

const formData = ref<Partial<BrandInsert | BrandUpdate>>({
  name: props.initialName || props.initialData?.name || '',
  slug: props.initialData?.slug || '',
  description: props.initialData?.description || null,
  logo_url: props.initialData?.logo_url || null,
})

const newLogoFile = ref<File | null>(null)

function autoFillSlug() {
  if (formData.value.name) {
    formData.value.slug = slugify(formData.value.name)
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  newLogoFile.value = target.files?.[0] || null
}

function handleSubmit() {
  if (!formData.value.name || !formData.value.slug) {
    toast.error('Название и Слаг - обязательные поля')
    return
  }

  emit('submit', {
    data: formData.value as BrandInsert | BrandUpdate,
    file: newLogoFile.value,
  })
}

const descriptionValue = computed({
  // GET: Когда компонент читает значение
  get: () => formData.value.description ?? '', // Преобразуем null в '' (пустую строку)

  // SET: Когда пользователь вводит значение
  set: (value: string) => {
    // Преобразуем пустую строку обратно в null для базы данных,
    // иначе в БД будет сохраняться '' вместо NULL
    formData.value.description = value === '' ? null : value
  },
})
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div>
      <Label for="brand-name">Название бренда *</Label>
      <Input id="brand-name" v-model="formData.name" @blur="autoFillSlug" />
    </div>
    <div>
      <Label for="brand-slug">Слаг (URL) *</Label>
      <Input id="brand-slug" v-model="formData.slug" />
    </div>
    <div>
      <Label for="brand-description">Описание</Label>
      <Textarea id="brand-description" v-model="descriptionValue" />
    </div>

    <!-- Логотип -->
    <div class="space-y-2 pt-4">
      <Label>Логотип</Label>
      <div v-if="formData.logo_url" class="flex items-center gap-3">
        <NuxtImg :src="formData.logo_url" alt="Текущий логотип" class="w-12 h-12 object-contain border rounded" />
        <p class="text-sm text-muted-foreground">
          Текущий логотип будет заменен.
        </p>
      </div>
      <Input type="file" accept="image/*" @change="handleFileChange" />
    </div>

    <Button type="submit" class="w-full">
      Сохранить бренд
    </Button>
  </form>
</template>
