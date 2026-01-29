<script setup lang="ts">
import type { EditableCategory } from '@/types'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import {
  formatFileSize,
  generateBlurPlaceholder,
  getOptimizationInfo,
  optimizeImageBeforeUpload,
  shouldOptimizeImage,
} from '@/utils/imageOptimizer'
import { slugify } from '@/utils/slugify'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

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
const isProcessingImage = ref(false)
const isSlugManuallyEdited = ref(false)

// 👇 Используем универсальную функцию getImageUrl
const { getImageUrl } = useSupabaseStorage()

const optimizationInfo = computed(() => getOptimizationInfo())

// 🆕 Загружаем бренды и линейки для фильтрации
const brandsStore = useAdminBrandsStore()
const productsStore = useAdminProductsStore()

onMounted(async () => {
  await brandsStore.fetchBrands()
  await productsStore.fetchAllProductLines()
})

const availableBrands = computed(() => brandsStore.brands)
const availableProductLines = computed(() => productsStore.productLines)

const name = computed({
  get: () => props.item.name,
  set: (value) => {
    const updatedItem = { ...props.item, name: value }

    // Автоматическая генерация slug только если:
    // 1. Элемент новый (_isNew) ИЛИ
    // 2. Slug не был изменён вручную
    if (value && (props.item._isNew || !isSlugManuallyEdited.value)) {
      const newSlug = slugify(value)
      updatedItem.slug = newSlug
      updatedItem.href = `${props.parentHref}/${newSlug}`
    }

    emit('update:item', updatedItem)
  },
})

const slug = computed({
  get: () => props.item.slug,
  set: (value) => {
    emit('update:item', { ...props.item, slug: value })
  },
})

// Функция для отметки ручного изменения slug
function onSlugInput() {
  isSlugManuallyEdited.value = true
}

const href = computed({
  get: () => props.item.href,
  set: value => emit('update:item', { ...props.item, href: value }),
})

const description = computed({
  get: () => props.item.description ?? '',
  set: value => emit('update:item', { ...props.item, description: value || null }),
})

// 🆕 SEO поля
const seoTitle = computed({
  get: () => props.item.seo_title ?? '',
  set: value => emit('update:item', { ...props.item, seo_title: value || null }),
})

const seoH1 = computed({
  get: () => props.item.seo_h1 ?? '',
  set: value => emit('update:item', { ...props.item, seo_h1: value || null }),
})

const seoText = computed({
  get: () => props.item.seo_text ?? '',
  set: value => emit('update:item', { ...props.item, seo_text: value || null }),
})

const seoKeywords = computed({
  get: () => (props.item.seo_keywords ?? []).join(', '),
  set: (value) => {
    const keywords = value
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0)
    emit('update:item', { ...props.item, seo_keywords: keywords.length > 0 ? keywords : null })
  },
})

// Показать/скрыть SEO секцию
const isSeoExpanded = ref(false)

// 🆕 Показать/скрыть секцию фильтров
const isFiltersExpanded = ref(false)

// 🆕 Управление фильтрами по брендам
const selectedBrandIds = computed({
  get: () => props.item.allowed_brand_ids ?? [],
  set: (value) => {
    emit('update:item', { ...props.item, allowed_brand_ids: value.length > 0 ? value : null })
  },
})

// 🆕 Управление фильтрами по линейкам
const selectedProductLineIds = computed({
  get: () => props.item.allowed_product_line_ids ?? [],
  set: (value) => {
    emit('update:item', { ...props.item, allowed_product_line_ids: value.length > 0 ? value : null })
  },
})

// 🆕 Функции для управления выбором
function toggleBrand(brandId: string) {
  const current = [...selectedBrandIds.value]
  const index = current.indexOf(brandId)
  if (index === -1) {
    current.push(brandId)
  }
  else {
    current.splice(index, 1)
  }
  selectedBrandIds.value = current
}

function toggleProductLine(lineId: string) {
  const current = [...selectedProductLineIds.value]
  const index = current.indexOf(lineId)
  if (index === -1) {
    current.push(lineId)
  }
  else {
    current.splice(index, 1)
  }
  selectedProductLineIds.value = current
}

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

// 👇 Computed для отображения оптимизированного изображения
const displayImageUrl = computed(() => {
  // Если есть превью нового файла (локальный blob URL)
  if (props.item._imagePreview) {
    return props.item._imagePreview
  }

  // Если есть существующее изображение в БД - используем оптимизацию
  if (props.item.image_url) {
    // Используем предустановку CATEGORY_IMAGE
    return getImageUrl(BUCKET_NAME_CATEGORY, props.item.image_url, IMAGE_SIZES.CATEGORY_MENU)
  }

  return null
})

// 🆕 Обработка загрузки изображения с генерацией blur
async function handleImageChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) {
    return
  }

  const file = target.files[0]
  if (!file) {
    return
  }

  isProcessingImage.value = true
  const toastId = toast.loading(
    `${optimizationInfo.value.icon} Обработка изображения...`,
  )

  try {
    let blurDataUrl: string | undefined
    let processedFile = file

    // Проверяем нужна ли оптимизация
    if (shouldOptimizeImage(file)) {
      const result = await optimizeImageBeforeUpload(file)

      console.log(
        `✅ ${file.name}: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)} (↓${result.savings.toFixed(0)}%) ${result.blurPlaceholder ? '+ LQIP ✨' : ''}`,
      )

      processedFile = result.file
      blurDataUrl = result.blurPlaceholder
    }
    else {
      // Файл маленький - генерируем только blur
      const blurResult = await generateBlurPlaceholder(file, 20, 0.5)
      console.log(`📤 ${file.name}: ${formatFileSize(file.size)} + LQIP ✨`)
      blurDataUrl = blurResult.dataUrl
    }

    // Создаем preview URL для отображения
    const previewUrl = URL.createObjectURL(processedFile)

    // Обновляем item с новым файлом и blur
    const updatedItem = {
      ...props.item,
      _imageFile: processedFile,
      _imagePreview: previewUrl,
      _blurPlaceholder: blurDataUrl, // 🆕 Сохраняем blur для последующей загрузки
      image_url: null, // Очищаем старый URL
    }

    emit('update:item', updatedItem)

    toast.success(
      `✅ Изображение готово ${optimizationInfo.value.icon}`,
      {
        id: toastId,
        description: blurDataUrl ? 'Blur placeholder сгенерирован' : undefined,
      },
    )
  }
  catch (error) {
    toast.error('❌ Ошибка при обработке файла', {
      id: toastId,
      description: (error as Error).message,
    })
    console.error('❌ handleImageChange error:', error)
  }
  finally {
    isProcessingImage.value = false
  }
}

function removeImage() {
  // Очищаем blob URL если он есть
  if (props.item._imagePreview) {
    URL.revokeObjectURL(props.item._imagePreview)
  }

  emit('update:item', {
    ...props.item,
    _imageFile: undefined,
    _imagePreview: undefined,
    _blurPlaceholder: undefined, // 🆕 Очищаем blur
    image_url: null,
    blur_placeholder: null, // 🆕 Очищаем blur в БД
  })
}
</script>

<template>
  <div :class="{ 'opacity-50 border-l-2 border-destructive pl-4 transition-opacity': isDeleted }">
    <div
      class="border p-4 rounded-lg space-y-4 bg-muted/40 relative shadow-sm"
      :style="{ marginLeft: `${level * 25}px` }"
    >
      <!-- Кнопки управления -->
      <div class="absolute top-2 right-2 flex items-center gap-2 z-10">
        <Button
          v-if="isDeleted"
          variant="outline"
          size="sm"
          type="button"
          class="text-xs h-7 border-primary text-primary hover:bg-primary/10"
          @click="isDeleted = false"
        >
          Восстановить
        </Button>
        <Button
          v-else
          variant="ghost"
          size="icon"
          type="button"
          class="text-destructive hover:bg-destructive/10 h-7 w-7"
          aria-label="Пометить на удаление"
          @click="emit('removeSelf')"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M7 21q-.825 0-1.412-.587T5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413T17 21zM17 6H7v13h10zM9 17h2V8H9zm4 0h2V8h-2zM7 6v13z" />
          </svg>
        </Button>
      </div>

      <p class="font-medium text-sm text-foreground pr-16">
        Редактирование категории (Уровень {{ level + 2 }})
      </p>

      <!-- Основные поля -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <Label :for="`name-${props.item._tempId || props.item.id}`">Название *</Label>
          <Input
            :id="`name-${props.item._tempId || props.item.id}`"
            v-model="name"
            required
            :disabled="isDeleted"
          />
        </div>
        <div>
          <Label :for="`slug-${props.item._tempId || props.item.id}`">Слаг (Slug) *</Label>
          <Input
            :id="`slug-${props.item._tempId || props.item.id}`"
            v-model="slug"
            required
            :disabled="isDeleted"
            @input="onSlugInput"
          />
        </div>
      </div>

      <div>
        <Label :for="`href-${props.item._tempId || props.item.id}`">Ссылка (URL) *</Label>
        <Input
          :id="`href-${props.item._tempId || props.item.id}`"
          v-model="href"
          required
          :disabled="isDeleted"
        />
      </div>

      <div>
        <div class="flex items-center justify-between">
          <Label :for="`desc-${props.item._tempId || props.item.id}`">
            SEO описание
          </Label>
          <span
            class="text-xs"
            :class="description.length > 160 ? 'text-destructive' : description.length > 120 ? 'text-amber-500' : 'text-muted-foreground'"
          >
            {{ description.length }}/160
          </span>
        </div>
        <Textarea
          :id="`desc-${props.item._tempId || props.item.id}`"
          v-model="description"
          rows="3"
          placeholder="Игрушки для девочек в Алматы: куклы, мягкие игрушки, наборы для творчества. Доставка по Казахстану."
          :disabled="isDeleted"
        />
        <p class="text-xs text-muted-foreground mt-1">
          Это описание отображается в Google. Оптимально 120-160 символов.
        </p>
      </div>

      <!-- 🆕 Секция фильтров по брендам/линейкам (раскрываемая) -->
      <div class="border rounded-lg">
        <button
          type="button"
          class="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
          :disabled="isDeleted"
          @click="isFiltersExpanded = !isFiltersExpanded"
        >
          <div class="flex items-center gap-2">
            <Icon name="lucide:filter" class="w-4 h-4 text-primary" />
            <span class="font-medium text-sm">Фильтры брендов и линеек</span>
            <span v-if="selectedBrandIds.length > 0 || selectedProductLineIds.length > 0" class="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
              {{ selectedBrandIds.length + selectedProductLineIds.length }} выбрано
            </span>
          </div>
          <Icon
            :name="isFiltersExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="w-4 h-4 text-muted-foreground"
          />
        </button>

        <div v-if="isFiltersExpanded" class="p-4 pt-0 space-y-6 border-t">
          <p class="text-xs text-muted-foreground">
            Ограничьте отображение товаров только определенными брендами или линейками. Если ничего не выбрано, показываются все товары.
          </p>

          <!-- Выбор брендов -->
          <div v-if="availableBrands.length > 0">
            <div class="flex items-center justify-between mb-3">
              <Label class="text-sm font-semibold">Разрешенные бренды</Label>
              <Button
                v-if="selectedBrandIds.length > 0"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs"
                @click="selectedBrandIds = []"
              >
                <Icon name="lucide:x" class="w-3.5 h-3.5 mr-1" />
                Очистить
              </Button>
            </div>
            <div class="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
              <div
                v-for="brand in availableBrands"
                :key="brand.id"
                class="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded transition-colors"
              >
                <Checkbox
                  :id="`brand-${brand.id}-${props.item._tempId || props.item.id}`"
                  :model-value="selectedBrandIds.includes(brand.id)"
                  :disabled="isDeleted"
                  @update:model-value="() => toggleBrand(brand.id)"
                />
                <Label
                  :for="`brand-${brand.id}-${props.item._tempId || props.item.id}`"
                  class="font-normal cursor-pointer text-sm flex-1"
                >
                  {{ brand.name }}
                </Label>
              </div>
            </div>
          </div>

          <!-- Выбор линеек продуктов -->
          <div v-if="availableProductLines.length > 0">
            <div class="flex items-center justify-between mb-3">
              <Label class="text-sm font-semibold">Разрешенные линейки продуктов</Label>
              <Button
                v-if="selectedProductLineIds.length > 0"
                variant="ghost"
                size="sm"
                class="h-6 px-2 text-xs"
                @click="selectedProductLineIds = []"
              >
                <Icon name="lucide:x" class="w-3.5 h-3.5 mr-1" />
                Очистить
              </Button>
            </div>
            <div class="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
              <div
                v-for="line in availableProductLines"
                :key="line.id"
                class="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded transition-colors"
              >
                <Checkbox
                  :id="`line-${line.id}-${props.item._tempId || props.item.id}`"
                  :model-value="selectedProductLineIds.includes(line.id)"
                  :disabled="isDeleted"
                  @update:model-value="() => toggleProductLine(line.id)"
                />
                <Label
                  :for="`line-${line.id}-${props.item._tempId || props.item.id}`"
                  class="font-normal cursor-pointer text-sm flex-1"
                >
                  {{ line.name }}
                </Label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 🆕 SEO секция (раскрываемая) -->
      <div class="border rounded-lg">
        <button
          type="button"
          class="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
          :disabled="isDeleted"
          @click="isSeoExpanded = !isSeoExpanded"
        >
          <div class="flex items-center gap-2">
            <Icon name="lucide:search" class="w-4 h-4 text-primary" />
            <span class="font-medium text-sm">Расширенные SEO настройки</span>
            <span v-if="seoTitle || seoH1 || seoText || seoKeywords" class="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
              Заполнено
            </span>
          </div>
          <Icon
            :name="isSeoExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="w-4 h-4 text-muted-foreground"
          />
        </button>

        <div v-if="isSeoExpanded" class="p-4 pt-0 space-y-4 border-t">
          <!-- SEO Title -->
          <div>
            <div class="flex items-center justify-between">
              <Label :for="`seo-title-${props.item._tempId || props.item.id}`">
                SEO заголовок (Title)
              </Label>
              <span
                class="text-xs"
                :class="seoTitle.length > 60 ? 'text-destructive' : seoTitle.length > 50 ? 'text-amber-500' : 'text-muted-foreground'"
              >
                {{ seoTitle.length }}/60
              </span>
            </div>
            <Input
              :id="`seo-title-${props.item._tempId || props.item.id}`"
              v-model="seoTitle"
              placeholder="Лего Майнкрафт купить в Алматы | Ухтышка"
              :disabled="isDeleted"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Заголовок для поисковиков. Если пусто, используется название категории.
            </p>
          </div>

          <!-- SEO H1 -->
          <div>
            <Label :for="`seo-h1-${props.item._tempId || props.item.id}`">
              H1 заголовок на странице
            </Label>
            <Input
              :id="`seo-h1-${props.item._tempId || props.item.id}`"
              v-model="seoH1"
              placeholder="Конструкторы Лего Майнкрафт"
              :disabled="isDeleted"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Главный заголовок на странице. Если пусто, используется название.
            </p>
          </div>

          <!-- SEO Keywords -->
          <div>
            <Label :for="`seo-keywords-${props.item._tempId || props.item.id}`">
              Ключевые слова
            </Label>
            <Input
              :id="`seo-keywords-${props.item._tempId || props.item.id}`"
              v-model="seoKeywords"
              placeholder="лего майнкрафт, minecraft lego, конструктор майнкрафт"
              :disabled="isDeleted"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Через запятую. Используются для meta keywords.
            </p>
          </div>

          <!-- SEO Text -->
          <div>
            <div class="flex items-center justify-between">
              <Label :for="`seo-text-${props.item._tempId || props.item.id}`">
                SEO текст (внизу страницы)
              </Label>
              <span class="text-xs text-muted-foreground">
                {{ seoText.length }} символов
              </span>
            </div>
            <Textarea
              :id="`seo-text-${props.item._tempId || props.item.id}`"
              v-model="seoText"
              rows="6"
              placeholder="Конструкторы Лего Майнкрафт - это увлекательный мир приключений для детей от 6 лет. В нашем интернет-магазине вы найдете оригинальные наборы LEGO Minecraft по выгодным ценам с доставкой по всему Казахстану..."
              :disabled="isDeleted"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Длинный текст для SEO, отображается внизу страницы категории. Рекомендуется 300-1000 символов.
            </p>
          </div>
        </div>
      </div>

      <!-- Порядок и видимость -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <Label :for="`order-${props.item._tempId || props.item.id}`">Порядок в меню</Label>
          <Input
            :id="`order-${props.item._tempId || props.item.id}`"
            v-model.number="display_order"
            type="number"
            :disabled="isDeleted"
          />
        </div>
        <div class="flex items-center space-x-2 pt-5">
          <Switch
            :id="`display-${props.item._tempId || props.item.id}`"
            v-model:model-value="display_in_menu"
            :disabled="props.item._isDeleted"
          />
          <Label :for="`display-${props.item._tempId || props.item.id}`">Показывать в меню</Label>
        </div>
      </div>

      <!-- 🆕 Изображение с обработкой и blur -->
      <div>
        <Label :for="`image-${props.item._tempId || props.item.id}`">
          Изображение для меню
          <span v-if="isProcessingImage" class="text-xs text-muted-foreground ml-2">
            {{ optimizationInfo.icon }} Обработка...
          </span>
        </Label>
        <Input
          :id="`image-${props.item._tempId || props.item.id}`"
          type="file"
          accept="image/png, image/jpeg, image/webp"
          :disabled="isDeleted || isProcessingImage"
          @change="handleImageChange"
        />

        <!-- 🎨 Индикатор наличия blur -->
        <p v-if="props.item._blurPlaceholder" class="text-xs text-green-600 mt-1 flex items-center gap-1">
          <Icon name="lucide:check-circle" class="w-3 h-3" />
          Blur placeholder готов
        </p>

        <div
          v-if="displayImageUrl"
          class="mt-2 border p-2 rounded-md inline-block relative bg-background"
        >
          <img
            :src="displayImageUrl"
            :alt="`Изображение для ${props.item.name}`"
            class="max-w-[150px] max-h-[80px] object-contain rounded"
            loading="lazy"
          >
          <Button
            variant="destructive"
            size="icon"
            class="absolute -top-2 -right-2 h-6 w-6 rounded-full"
            type="button"
            aria-label="Удалить изображение"
            :disabled="isDeleted"
            @click="removeImage"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z" />
            </svg>
          </Button>

          <!-- 👀 Индикатор blur на превью -->
          <div
            v-if="props.item._blurPlaceholder"
            class="absolute bottom-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
          >
            <Icon name="lucide:sparkles" class="w-2.5 h-2.5" />
            <span>LQIP</span>
          </div>
        </div>
      </div>

      <!-- Подкатегории -->
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

      <Button
        size="sm"
        variant="outline"
        class="mt-2 border-dashed w-full"
        :disabled="isDeleted"
        @click="emit('addChild', props.item)"
      >
        Добавить подкатегорию в "{{ props.item.name }}" (Уровень {{ level + 3 }})
      </Button>
    </div>
  </div>
</template>
