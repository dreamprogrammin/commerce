<script setup lang="ts">
import type { Brand, BrandInsert, BrandUpdate } from '@/types'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  initialData?: Brand | null
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { data: BrandInsert | BrandUpdate, file: File | null }): void
}>()

const formData = ref<Partial<BrandInsert | BrandUpdate>>({})
const logoFile = ref<File | null>(null)
const logoPreview = ref<string | null>(null)

watch(() => props.initialData, (brand) => {
  if (brand) {
    formData.value = { ...brand }
    logoPreview.value = null
    logoFile.value = null
  }
  else {
    formData.value = { name: '', slug: '', description: '', logo_url: null }
  }
}, { immediate: true })

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    logoFile.value = file
    logoPreview.value = URL.createObjectURL(file)
  }
}

function autoFillSlug() {
  if (formData.value.name && !formData.value.slug)
    formData.value.slug = slugify(formData.value.name)
}

function handleSubmit() {
  emit('submit', { data: formData.value, file: logoFile.value })
}

const descriptionValue = computed({
  get() {
    return formData.value.description ?? ''
  },
  set(value) {
    if (formData.value) {
      formData.value.description = value || null
    }
  },
})
</script>

<template>
  <form class="space-y-6" @submit.prevent="handleSubmit">
    <Card>
      <CardHeader>
        <CardTitle>Основная информация</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div>
          <Label for="name">Название бренда *</Label>
          <Input id="name" v-model="formData.name" required @blur="autoFillSlug" />
        </div>
        <div>
          <Label for="slug">Слаг (URL) *</Label>
          <Input id="slug" v-model="formData.slug" required />
        </div>
        <div>
          <Label for="description">Описание</Label>
          <Textarea id="description" v-model="descriptionValue" />
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Логотип</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="logoPreview" class="mb-4">
          <p class="text-sm mb-2">
            Превью нового логотипа:
          </p>
          <img :src="logoPreview" alt="Превью" class="w-24 h-24 object-contain border rounded-md">
        </div>
        <div>
          <Label for="logo">Загрузить новый логотип</Label>
          <Input id="logo" type="file" accept="image/*" @change="handleFileChange" />
          <p class="text-sm text-muted-foreground mt-1">
            (старый логотип, если он есть, будет заменен)
          </p>
        </div>
      </CardContent>
    </Card>

    <Button type="submit" size="lg">
      Сохранить бренд
    </Button>
  </form>
</template>
