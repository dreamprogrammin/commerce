<script setup lang="ts">
import type { BrandInsert, BrandPageLayout, BrandUpdate, Database, ProductLine } from '@/types'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { formatFileSize, optimizeImageBeforeUpload } from '@/utils/imageOptimizer'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  initialData?: BrandInsert | BrandUpdate | null
  initialName?: string // Для автозаполнения из комбобокса
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { data: BrandInsert | BrandUpdate, file: File | null }): void
}>()

const { getVariantUrl } = useSupabaseStorage()
const supabase = useSupabaseClient<Database>()

// Парсим page_layout из initialData
const initialLayout = (props.initialData as any)?.page_layout as BrandPageLayout | null

const formData = ref<Partial<BrandInsert | BrandUpdate>>({
  name: props.initialName || props.initialData?.name || '',
  slug: props.initialData?.slug || '',
  description: props.initialData?.description || null,
  logo_url: props.initialData?.logo_url || null,
  is_custom_page: (props.initialData as any)?.is_custom_page || false,
  page_layout: props.initialData ? (props.initialData as any).page_layout : null,
  // SEO поля
  seo_description: props.initialData?.seo_description || null,
  seo_keywords: props.initialData?.seo_keywords || null,
})

const newLogoFile = ref<File | null>(null)
const logoPreviewUrl = ref<string | null>(null)
const isSlugManuallyEdited = ref(false)
const isProcessingLogo = ref(false)

// --- Custom Landing Page ---
const brandProductLines = ref<ProductLine[]>([])
const selectedLineIds = ref<string[]>(initialLayout?.featuredLineIds || [])

// Загружаем линейки бренда при включении кастомной страницы
watch(() => formData.value.is_custom_page, async (isCustom) => {
  if (isCustom && props.initialData && 'id' in props.initialData && props.initialData.id) {
    await loadBrandProductLines((props.initialData as any).id)
  }
}, { immediate: true })

async function loadBrandProductLines(brandId: string) {
  const { data } = await supabase
    .from('product_lines')
    .select('*')
    .eq('brand_id', brandId)
    .order('name', { ascending: true })
  if (data) {
    brandProductLines.value = data as ProductLine[]
  }
}

function toggleLineSelection(lineId: string) {
  const idx = selectedLineIds.value.indexOf(lineId)
  if (idx >= 0) {
    selectedLineIds.value.splice(idx, 1)
  }
  else {
    selectedLineIds.value.push(lineId)
  }
}

// Автоматическая генерация slug при изменении названия
watch(() => formData.value.name, (newName) => {
  // Генерируем slug только если не был изменён вручную
  if (newName && !isSlugManuallyEdited.value) {
    formData.value.slug = slugify(newName)
  }
})

// Функция для отметки ручного изменения slug
function onSlugInput() {
  isSlugManuallyEdited.value = true
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null

  if (!file) {
    newLogoFile.value = null
    logoPreviewUrl.value = null
    return
  }

  isProcessingLogo.value = true
  try {
    const result = await optimizeImageBeforeUpload(file)
    newLogoFile.value = result.file
    logoPreviewUrl.value = URL.createObjectURL(result.file)
    toast.success('Логотип оптимизирован', {
      description: `${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)} (↓${result.savings.toFixed(0)}%)`,
    })
  }
  catch {
    // fallback на оригинал
    newLogoFile.value = file
    logoPreviewUrl.value = URL.createObjectURL(file)
  }
  finally {
    isProcessingLogo.value = false
  }
}

function handleSubmit() {
  if (!formData.value.name || !formData.value.slug) {
    toast.error('Название и Слаг - обязательные поля')
    return
  }

  // Обновляем page_layout с выбранными линейками
  if (formData.value.is_custom_page) {
    const currentLayout: BrandPageLayout = { featuredLineIds: selectedLineIds.value }
    formData.value.page_layout = currentLayout as any
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

const displayLogoUrl = computed(() => {
  if (logoPreviewUrl.value) {
    return logoPreviewUrl.value
  }

  const logoUrl = formData.value.logo_url
  if (logoUrl && typeof logoUrl === 'string') {
    return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
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
      <Input id="brand-name" v-model="formData.name" placeholder="Например: L.O.L. Surprise" />
    </div>

    <div>
      <Label for="brand-slug">Слаг (URL) *</Label>
      <Input id="brand-slug" v-model="formData.slug" @input="onSlugInput" />
    </div>

    <div>
      <Label for="brand-description">Описание</Label>
      <Textarea id="brand-description" v-model="descriptionValue" />
    </div>

    <!-- 👇 Логотип с оптимизацией через getImageUrl -->
    <div class="space-y-2 pt-4">
      <Label>
        Логотип
        <span v-if="isProcessingLogo" class="text-xs text-muted-foreground ml-2">
          💾 Обработка...
        </span>
      </Label>
      <div v-if="displayLogoUrl" class="flex items-center gap-3 mb-2">
        <img
          :src="displayLogoUrl"
          alt="Логотип бренда"
          class="w-12 h-12 object-contain border rounded bg-muted"
          loading="lazy"
          @error="($event.target as HTMLImageElement).src = '/images/placeholder.svg'"
        >
        <p class="text-sm text-muted-foreground">
          {{ newLogoFile ? 'Новый логотип (будет загружен)' : 'Текущий логотип' }}
        </p>
      </div>
      <Input type="file" accept="image/*" :disabled="isProcessingLogo" @change="handleFileChange" />
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

    <!-- Кастомная Landing Page -->
    <div class="space-y-4 pt-6 border-t">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-semibold">
            Кастомная Landing Page
          </h3>
          <p class="text-xs text-muted-foreground">
            Включите для отображения избранных коллекций крупными карточками
          </p>
        </div>
        <Switch
          :model-value="!!formData.is_custom_page"
          @update:model-value="formData.is_custom_page = $event"
        />
      </div>

      <template v-if="formData.is_custom_page">
        <!-- Выбор избранных линеек -->
        <div v-if="brandProductLines.length > 0" class="space-y-2">
          <Label>Избранные линейки (отображаются крупно)</Label>
          <div class="grid grid-cols-1 gap-2">
            <label
              v-for="line in brandProductLines"
              :key="line.id"
              class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
              :class="selectedLineIds.includes(line.id) ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'"
            >
              <Checkbox
                :model-value="selectedLineIds.includes(line.id)"
                @update:model-value="toggleLineSelection(line.id)"
              />
              <span class="text-sm font-medium">{{ line.name }}</span>
            </label>
          </div>
          <p class="text-xs text-muted-foreground">
            Выбранные линейки будут отображаться крупными карточками в верхней части страницы
          </p>
        </div>
        <div v-else class="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
          Нет линеек для этого бренда. Добавьте линейки во вкладке "Линейки".
        </div>
      </template>
    </div>

    <Button type="submit" class="w-full">
      Сохранить бренд
    </Button>
  </form>
</template>
