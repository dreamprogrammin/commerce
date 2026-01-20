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
  // SEO поля
  seo_description: props.initialData?.seo_description || null,
  seo_keywords: props.initialData?.seo_keywords || null,
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

// --- SEO ПОЛЯ ---

const seoDescriptionValue = computed({
  get: () => formData.value.seo_description ?? '',
  set: (value: string) => {
    formData.value.seo_description = value === '' ? null : value
  },
})

const seoKeywordsString = computed({
  get: () => formData.value.seo_keywords?.join(', ') ?? '',
  set: (value: string) => {
    const keywords = value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
    formData.value.seo_keywords = keywords.length > 0 ? keywords : null
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

    <!-- 🔍 SEO секция -->
    <div class="space-y-4 pt-6 border-t">
      <h3 class="font-semibold flex items-center gap-2">
        <Icon name="lucide:search" class="w-4 h-4" />
        SEO оптимизация
      </h3>

      <div>
        <div class="flex items-center justify-between">
          <Label for="seo-description">SEO описание</Label>
          <span
            class="text-xs"
            :class="seoDescriptionValue.length > 160 ? 'text-destructive' : seoDescriptionValue.length > 120 ? 'text-amber-500' : 'text-muted-foreground'"
          >
            {{ seoDescriptionValue.length }}/160
          </span>
        </div>
        <Textarea
          id="seo-description"
          v-model="seoDescriptionValue"
          rows="3"
          placeholder="Товары бренда L.O.L. Surprise в Алматы. Оригинальная продукция с доставкой по Казахстану."
        />
        <p class="text-xs text-muted-foreground mt-1">
          Описание для Google. Оптимально 120-160 символов.
        </p>
      </div>

      <div>
        <Label for="seo-keywords">Ключевые слова</Label>
        <Input
          id="seo-keywords"
          v-model="seoKeywordsString"
          placeholder="L.O.L. Surprise, куклы, игрушки для девочек, купить в Алматы"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Введите через запятую. Помогают поисковикам найти бренд.
        </p>
      </div>

      <!-- Предпросмотр в Google -->
      <div v-if="formData.name" class="p-3 bg-muted/50 rounded-lg space-y-1">
        <p class="text-xs text-muted-foreground mb-2">
          Предпросмотр в Google:
        </p>
        <p class="text-blue-600 text-sm hover:underline cursor-pointer truncate">
          {{ formData.name }} - Купить товары бренда | Ухтышка
        </p>
        <p class="text-green-700 text-xs">
          uhti.kz › brand › {{ formData.slug || '...' }}
        </p>
        <p class="text-xs text-muted-foreground line-clamp-2">
          {{ seoDescriptionValue || descriptionValue || 'Описание бренда будет показано здесь...' }}
        </p>
      </div>
    </div>

    <Button type="submit" class="w-full">
      Сохранить бренд
    </Button>
  </form>
</template>
