<script setup lang="ts">
import type { ProductLine, ProductLineInsert } from '@/types'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_PRESETS } from '@/config/images'
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  brandId: string
  initialData?: ProductLine | null
  initialName?: string
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { data: ProductLineInsert, file: File | null }): void
}>()

const { getImageUrl } = useSupabaseStorage()

const formData = ref<Partial<ProductLineInsert>>({
  brand_id: props.brandId,
  name: props.initialName || props.initialData?.name || '',
  slug: props.initialData?.slug || '',
  description: props.initialData?.description || null,
  logo_url: props.initialData?.logo_url || null,
  seo_description: props.initialData?.seo_description || null,
  seo_keywords: props.initialData?.seo_keywords || null,
})

const newLogoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const isSlugManuallyEdited = ref(false)

// Обновляем formData при изменении initialData (для редактирования)
watch(() => props.initialData, (newData) => {
  formData.value = {
    brand_id: props.brandId,
    name: newData?.name || props.initialName || '',
    slug: newData?.slug || '',
    description: newData?.description || null,
    logo_url: newData?.logo_url || null,
    seo_description: newData?.seo_description || null,
    seo_keywords: newData?.seo_keywords || null,
  }
  newLogoFile.value = null
  logoPreviewUrl.value = null
  isSlugManuallyEdited.value = !!newData?.slug
}, { immediate: false })

// Автоматическая генерация slug при изменении названия
watch(() => formData.value.name, (newName) => {
  if (newName && !isSlugManuallyEdited.value) {
    formData.value.slug = slugify(newName)
  }
})

function onSlugInput() {
  isSlugManuallyEdited.value = true
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null
  newLogoFile.value = file

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
    data: {
      ...formData.value,
      brand_id: props.brandId,
    } as ProductLineInsert,
    file: newLogoFile.value,
  })
}

const descriptionValue = computed({
  get: () => formData.value.description ?? '',
  set: (value: string) => {
    formData.value.description = value === '' ? null : value
  },
})

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

const displayLogoUrl = computed(() => {
  if (logoPreviewUrl.value) {
    return logoPreviewUrl.value
  }

  const logoUrl = formData.value.logo_url
  if (logoUrl && typeof logoUrl === 'string') {
    return getImageUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, IMAGE_PRESETS.PRODUCT_LINE_LOGO)
  }

  return null
})

onBeforeUnmount(() => {
  if (logoPreviewUrl.value) {
    URL.revokeObjectURL(logoPreviewUrl.value)
  }
})
</script>

<template>
  <form class="space-y-4" @submit.prevent="handleSubmit">
    <div>
      <Label for="line-name">Название линейки *</Label>
      <Input id="line-name" v-model="formData.name" placeholder="Например: Barbie, Hot Wheels" />
    </div>

    <div>
      <Label for="line-slug">Слаг (URL) *</Label>
      <Input id="line-slug" v-model="formData.slug" @input="onSlugInput" />
    </div>

    <div>
      <Label for="line-description">Описание</Label>
      <Textarea id="line-description" v-model="descriptionValue" rows="2" />
    </div>

    <div class="space-y-2">
      <Label>Логотип линейки</Label>
      <div v-if="displayLogoUrl" class="flex items-center gap-3 mb-2">
        <img
          :src="displayLogoUrl"
          alt="Логотип линейки"
          class="w-12 h-12 object-contain border rounded bg-muted"
          loading="lazy"
        >
        <p class="text-sm text-muted-foreground">
          {{ newLogoFile ? 'Новый логотип' : 'Текущий логотип' }}
        </p>
      </div>
      <Input type="file" accept="image/*" @change="handleFileChange" />
    </div>

    <!-- SEO секция (опциональная, можно свернуть) -->
    <Collapsible>
      <CollapsibleTrigger as-child>
        <Button variant="ghost" size="sm" class="w-full justify-start text-muted-foreground">
          <Icon name="lucide:search" class="w-4 h-4 mr-2" />
          SEO настройки (опционально)
          <Icon name="lucide:chevron-down" class="w-4 h-4 ml-auto" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent class="space-y-4 pt-4">
        <div>
          <div class="flex items-center justify-between">
            <Label for="seo-description">SEO описание</Label>
            <span
              class="text-xs"
              :class="seoDescriptionValue.length > 160 ? 'text-destructive' : 'text-muted-foreground'"
            >
              {{ seoDescriptionValue.length }}/160
            </span>
          </div>
          <Textarea
            id="seo-description"
            v-model="seoDescriptionValue"
            rows="2"
            placeholder="Описание для поисковиков"
          />
        </div>

        <div>
          <Label for="seo-keywords">Ключевые слова</Label>
          <Input
            id="seo-keywords"
            v-model="seoKeywordsString"
            placeholder="Barbie, куклы Barbie, игрушки для девочек"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>

    <Button type="submit" class="w-full">
      Сохранить линейку
    </Button>
  </form>
</template>
