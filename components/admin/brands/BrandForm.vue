<script setup lang="ts">
import type { BrandInsert, BrandUpdate } from '@/types'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  initialData?: BrandInsert | BrandUpdate | null
  initialName?: string // Для автозаполнения из комбобокса
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { data: BrandInsert | BrandUpdate, file: File | null }): void
}>()

// 👇 Используем универсальную функцию getImageUrl
const { getImageUrl } = useSupabaseStorage()

const formData = ref<Partial<BrandInsert | BrandUpdate>>({
  name: props.initialName || props.initialData?.name || '',
  slug: props.initialData?.slug || '',
  description: props.initialData?.description || null,
  logo_url: props.initialData?.logo_url || null,
})

const newLogoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)

function autoFillSlug() {
  if (formData.value.name) {
    formData.value.slug = slugify(formData.value.name)
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null
  newLogoFile.value = file

  // Создаем превью для нового файла
  if (file) {
    logoPreviewUrl.value = URL.createObjectURL(file)
  }
  else {
    logoPreviewUrl.value = null
  }
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
  get: () => formData.value.description ?? '',
  set: (value: string) => {
    formData.value.description = value === '' ? null : value
  },
})

// 👇 Computed для отображения логотипа с использованием getImageUrl
const displayLogoUrl = computed(() => {
  // Если выбран новый файл, показываем его превью (локальный blob URL)
  if (logoPreviewUrl.value) {
    return logoPreviewUrl.value
  }

  // Если есть существующий логотип в БД - используем оптимизацию
  const logoUrl = formData.value.logo_url
  if (logoUrl && typeof logoUrl === 'string') {
    // Можно использовать предустановку или кастомные параметры
    // Вариант 1: Кастомные параметры (для логотипов лучше contain)
    return getImageUrl(BUCKET_NAME_BRANDS, logoUrl, {
      width: 200,
      height: 200,
      quality: 85,
      format: 'webp',
      resize: 'contain',
    })

    // Вариант 2: Можно добавить в config/images.ts:
    // BRAND_LOGO: { width: 200, height: 200, quality: 85, format: 'webp', resize: 'contain' }
    // И использовать: IMAGE_SIZES.BRAND_LOGO
  }

  return null
})

// Очистка preview URL при размонтировании
onBeforeUnmount(() => {
  if (logoPreviewUrl.value) {
    URL.revokeObjectURL(logoPreviewUrl.value)
  }
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

    <!-- 👇 Логотип с оптимизацией через getImageUrl -->
    <div class="space-y-2 pt-4">
      <Label>Логотип</Label>
      <div v-if="displayLogoUrl" class="flex items-center gap-3 mb-2">
        <img
          :src="displayLogoUrl"
          alt="Логотип бренда"
          class="w-12 h-12 object-contain border rounded bg-muted"
          loading="lazy"
        >
        <p class="text-sm text-muted-foreground">
          {{ newLogoFile ? 'Новый логотип (будет загружен)' : 'Текущий логотип' }}
        </p>
      </div>
      <Input type="file" accept="image/*" @change="handleFileChange" />
    </div>

    <Button type="submit" class="w-full">
      Сохранить бренд
    </Button>
  </form>
</template>
