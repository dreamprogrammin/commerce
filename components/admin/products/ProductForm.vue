<script setup lang="ts">
import type {
  AttributeValuePayload,
  AttributeWithValue,
  BrandInsert,
  BrandUpdate,
  FullProduct,
  ProductFormData,
  ProductImageRow,
  ProductInsert,
  ProductLine,
  ProductLineInsert,
  ProductSearchResult,
  ProductUpdate,
  ProductWithImages,
} from '@/types'
import { debounce } from 'lodash-es'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'
import { useAdminProductLinesStore } from '@/stores/adminStore/adminProductLinesStore'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { useAdminSuppliersStore } from '@/stores/adminStore/adminSuppliersStore'
import {
  formatFileSize,
  getOptimizationInfo,
  optimizeImageBeforeUpload,
} from '@/utils/imageOptimizer'
import { calculateBonusPoints } from '@/utils/bonusCalculator'
import { slugify } from '@/utils/slugify'
import BrandForm from '../brands/BrandForm.vue'
import ProductLineForm from '../product-lines/ProductLineForm.vue'

interface NewImageFile {
  id: string
  file: File
  previewUrl: string
  blurDataUrl?: string
}

// --- 1. PROPS & EMITS ---
const props = defineProps<{
  initialData?: FullProduct | null
}>()

const emit = defineEmits<{
  (
    e: 'create',
    payload: {
      data: ProductInsert
      newImageFiles: NewImageFile[]
      attributeValues: AttributeValuePayload[]
    }
  ): void
  (
    e: 'update',
    payload: {
      data: ProductUpdate
      newImageFiles: NewImageFile[]
      imagesToDelete: string[]
      existingImages: ProductImageRow[]
      attributeValues: AttributeValuePayload[]
    }
  ): void
}>()

// --- 2. ИНИЦИАЛИЗАЦИЯ СТОРОВ И COMPOSABLES ---
const categoriesStore = useAdminCategoriesStore()
const productStore = useAdminProductsStore()
const brandsStore = useAdminBrandsStore()
const productLinesStore = useAdminProductLinesStore()
const suppliersStore = useAdminSuppliersStore()
const { suppliers } = storeToRefs(suppliersStore)
const { getVariantUrl } = useSupabaseStorage()

const { brands, countries, materials } = storeToRefs(productStore)

// --- 3. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
const formData = ref<Partial<ProductFormData>>({})
const isBrandDialogOpen = ref(false)
const categoryAttributes = ref<AttributeWithValue[]>([])
const productAttributeValues = ref<Record<number, number | null>>({})
const numericAttributeValues = ref<Record<number, number | null>>({})
const isProcessingImages = ref(false)

const bonusOptions = [
  { label: 'Стандарт (5%)', value: 5 },
  { label: 'Повышенный (20%)', value: 20 },
  { label: 'Акция (80%)', value: 80 },
  { label: 'Подарок (100%)', value: 100 },
]

const newImageFiles = ref<NewImageFile[]>([])
const existingImages = ref<ProductImageRow[]>([])
const imagesToDelete = ref<string[]>([])
const selectedBonusPercent = ref(5)
const isDraggingOver = ref(false)

const linkedAccessories = ref<(ProductWithImages | ProductSearchResult)[]>([])
const accessorySearchQuery = ref('')
const accessorySearchResults = ref<ProductSearchResult[]>([])
const isSearchingAccessories = ref(false)
const brandSearchQuery = ref('')
const productLineSearchQuery = ref('')
const brandProductLines = ref<ProductLine[]>([])
const isProductLineDialogOpen = ref(false)
const isLoadingProductLines = ref(false)
const fileInputKey = ref(0)
const isSlugManuallyEdited = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isSettingUp = ref(false)

// 🎯 Информация об оптимизации
const optimizationInfo = computed(() => getOptimizationInfo())

// --- 4. ИНИЦИАЛИЗАЦИЯ ДАННЫХ ---

function setupFormData(product: FullProduct | null | undefined) {
  isSettingUp.value = true
  newImageFiles.value = []
  imagesToDelete.value = []
  linkedAccessories.value = []

  if (product && product.id) {
    // ✏️ РЕЖИМ РЕДАКТИРОВАНИЯ
    formData.value = {
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      cost_price: product.cost_price ?? 0,
      category_id: product.category_id,
      stock_quantity: product.stock_quantity,
      is_active: product.is_active,
      bonus_points_award: product.bonus_points_award,
      min_age_years: product.min_age_years,
      max_age_years: product.max_age_years,
      gender: product.gender as 'unisex' | 'male' | 'female' | null,
      accessory_ids: product.accessory_ids || [],
      is_accessory: product.is_accessory || false,
      sku: product.sku,
      brand_id: product.brand_id,
      product_line_id: product.product_line_id || null,
      supplier_id: (product as any).supplier_id || null,
      origin_country_id: product.origin_country_id,
      discount_percentage: product.discount_percentage || 0,
      material_id: product.material_id,
      barcode: product.barcode,
      is_featured: product.is_featured || false,
      featured_order: product.featured_order || 0,
      // SEO поля
      seo_description: product.seo_description || null,
      seo_keywords: product.seo_keywords || null,
      // Количество деталей для конструкторов
      piece_count: product.piece_count || null,
      // Закупки
      min_stock_level: (product as any).min_stock_level ?? 2,
      restock_quantity: (product as any).restock_quantity ?? 5,
    }
    // 🎯 ВАЖНО: Сортируем изображения по display_order для сохранения порядка
    existingImages.value = [...(product.product_images || [])].sort((a, b) => a.display_order - b.display_order)

    if (product.accessory_ids && product.accessory_ids.length > 0) {
      productStore.fetchProductsByIds(product.accessory_ids).then(data => linkedAccessories.value = data)
    }

    if (product.price > 0 && product.bonus_points_award) {
      const percent = Math.round((product.bonus_points_award / Number(product.price)) * 100)
      selectedBonusPercent.value = bonusOptions.find(opt => opt.value === percent)?.value || 5
    }
  }
  else {
    // ✨ РЕЖИМ СОЗДАНИЯ
    formData.value = {
      name: '',
      slug: '',
      price: 0,
      cost_price: 0,
      is_active: true,
      stock_quantity: 0,
      description: null,
      category_id: null,
      bonus_points_award: 0,
      min_age_years: null,
      max_age_years: null,
      gender: 'unisex',
      accessory_ids: [],
      is_accessory: false,
      sku: null,
      brand_id: null,
      product_line_id: null,
      supplier_id: null,
      origin_country_id: null,
      discount_percentage: 0,
      material_id: null,
      barcode: null,
      is_featured: false,
      featured_order: 0,
      // SEO поля
      seo_description: null,
      seo_keywords: null,
      // Количество деталей для конструкторов
      piece_count: null,
      // Закупки
      min_stock_level: 2,
      restock_quantity: 5,
    }
    existingImages.value = []
    selectedBonusPercent.value = 5
  }
  nextTick(() => {
    isSettingUp.value = false
  })
}

watch(
  () => props.initialData,
  newProduct => setupFormData(newProduct),
  { immediate: true },
)

// --- 5. ВЫЧИСЛЯЕМЫЕ ЗНАЧЕНИЯ ---

const filteredBrands = computed(() => {
  if (!brandSearchQuery.value) {
    return brands.value
  }
  return brands.value.filter(brand =>
    brand.name.toLowerCase().includes(brandSearchQuery.value.toLowerCase()),
  )
})

const filteredProductLines = computed(() => {
  if (!productLineSearchQuery.value) {
    return brandProductLines.value
  }
  return brandProductLines.value.filter(line =>
    line.name.toLowerCase().includes(productLineSearchQuery.value.toLowerCase()),
  )
})

// --- 6. ОБРАБОТЧИКИ СОБЫТИЙ ---

async function handleBrandCreate(payload: { data: BrandInsert | BrandUpdate, file: File | null }) {
  const newBrand = await brandsStore.createBrand(payload.data as BrandInsert, payload.file)
  if (newBrand) {
    isBrandDialogOpen.value = false
    await brandsStore.fetchBrands()
    await productStore.fetchAllBrands()
    await nextTick()
    formData.value.brand_id = newBrand.id
    brandSearchQuery.value = ''
  }
}

async function handleProductLineCreate(payload: { data: ProductLineInsert, file: File | null }) {
  const newLine = await productLinesStore.createProductLine(payload.data, payload.file)
  if (newLine) {
    isProductLineDialogOpen.value = false
    // Перезагружаем линейки текущего бренда
    if (formData.value.brand_id) {
      brandProductLines.value = await productLinesStore.fetchProductLinesByBrand(formData.value.brand_id)
    }
    await nextTick()
    formData.value.product_line_id = newLine.id
    productLineSearchQuery.value = ''
  }
}

// Загружаем линейки при смене бренда
watch(() => formData.value.brand_id, async (newBrandId, oldBrandId) => {
  // Сбрасываем линейку при смене бренда (но не при инициализации формы)
  if (newBrandId !== oldBrandId && !isSettingUp.value) {
    formData.value.product_line_id = null
  }

  if (newBrandId) {
    isLoadingProductLines.value = true
    try {
      brandProductLines.value = await productLinesStore.fetchProductLinesByBrand(newBrandId)
    }
    finally {
      isLoadingProductLines.value = false
    }
  }
  else {
    brandProductLines.value = []
  }
}, { immediate: true })

async function handleCategoryChange(categoryId: string | null) {
  if (!categoryId) {
    categoryAttributes.value = []
    return
  }

  categoryAttributes.value = await productStore.getAttributesForCategory(categoryId)

  const newSelectValues: Record<number, number | null> = {}
  const newNumericValues: Record<number, number | null> = {}

  for (const attr of categoryAttributes.value) {
    if (attr.display_type === 'numeric') {
      newNumericValues[attr.id] = null
    }
    else {
      newSelectValues[attr.id] = null
    }
  }

  if (props.initialData?.id) {
    const savedValues = await productStore.getProductAttributeValues(props.initialData.id)
    for (const savedValue of savedValues) {
      if (savedValue.attribute_id in newSelectValues) {
        newSelectValues[savedValue.attribute_id] = savedValue.option_id
      }
      if (savedValue.attribute_id in newNumericValues) {
        newNumericValues[savedValue.attribute_id] = savedValue.numeric_value
      }
    }
  }
  productAttributeValues.value = newSelectValues
  numericAttributeValues.value = newNumericValues
}

watch(() => formData.value.category_id, (newCategoryId) => {
  const categoryIdForHandler = newCategoryId === undefined ? null : newCategoryId
  handleCategoryChange(categoryIdForHandler)
}, { immediate: true })

// Автоматическая генерация slug при изменении названия
watch(() => formData.value?.name, (newName) => {
  // Генерируем slug только если он пустой или не был изменён вручную
  if (newName && formData.value && (!formData.value.slug || !isSlugManuallyEdited.value)) {
    formData.value.slug = slugify(newName)
  }
})

// Функция для отметки ручного изменения slug
function onSlugInput() {
  isSlugManuallyEdited.value = true
}

watch(
  [() => formData.value.price, () => formData.value.discount_percentage, selectedBonusPercent],
  ([price, discount, percent]) => {
    if (formData.value && typeof price === 'number' && typeof percent === 'number') {
      formData.value.bonus_points_award = calculateBonusPoints(price, discount || 0, percent)
    }
  },
)

// --- 7. УПРАВЛЕНИЕ ИЗОБРАЖЕНИЯМИ ---

/**
 * 🎯 Обработка загрузки изображений через input
 */
async function handleFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (!target.files || target.files.length === 0) {
    return
  }
  await processFiles(Array.from(target.files))
}

function removeNewImage(index: number) {
  const fileToRemove = newImageFiles.value[index]
  if (fileToRemove) {
    URL.revokeObjectURL(fileToRemove.previewUrl)
  }
  newImageFiles.value.splice(index, 1)
}

function removeExistingImage(image: ProductImageRow) {
  imagesToDelete.value.push(image.id)
  existingImages.value = existingImages.value.filter(img => img.id !== image.id)
}

/**
 * 🎯 Получить URL для превью существующего изображения
 * Использует sm-вариант (400px) с обратной совместимостью для старых фото
 */
function getExistingImageUrl(imageUrl: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm') || ''
}

// --- DRAG & DROP ФУНКЦИИ ---

function onDragOver(event: DragEvent) {
  event.preventDefault()
  isDraggingOver.value = true
}

function onDragLeave() {
  isDraggingOver.value = false
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  isDraggingOver.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0)
    return

  // Фильтруем только изображения
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
  if (imageFiles.length === 0) {
    toast.error('Пожалуйста, загружайте только изображения')
    return
  }

  await processFiles(imageFiles)
}

async function processFiles(files: File[]) {
  isProcessingImages.value = true

  const toastId = toast.loading(
    `${optimizationInfo.value.icon} Обработка ${files.length} изображений...`,
  )

  try {
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        try {
          const result = await optimizeImageBeforeUpload(file)

          console.log(
            `✅ ${file.name}: ${formatFileSize(result.originalSize)} → ${formatFileSize(result.optimizedSize)} (↓${result.savings.toFixed(0)}%) ${result.blurPlaceholder ? '+ LQIP ✨' : ''}`,
          )

          return {
            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file: result.file,
            previewUrl: URL.createObjectURL(result.file),
            blurDataUrl: result.blurPlaceholder,
          }
        }
        catch (error) {
          console.error(`❌ Ошибка оптимизации ${file.name}:`, error)
          toast.warning(`Ошибка обработки ${file.name}, используем оригинал`)

          return {
            id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            file,
            previewUrl: URL.createObjectURL(file),
            blurDataUrl: undefined,
          }
        }
      }),
    )

    newImageFiles.value.push(...processedFiles)

    toast.success(
      `✅ ${processedFiles.length} изображений загружено ${optimizationInfo.value.icon}`,
      { id: toastId },
    )

    // 🎯 Пересоздаём input для очистки
    fileInputKey.value++
  }
  catch (error) {
    toast.error('❌ Ошибка при обработке файлов', { id: toastId })
    console.error('processFiles error:', error)
  }
  finally {
    isProcessingImages.value = false
  }
}

// Установка главной картинки для существующих изображений
function setPrimaryExistingImage(index: number) {
  if (index === 0)
    return // Уже первая

  const image = existingImages.value[index]
  if (!image)
    return // Проверка на существование

  existingImages.value.splice(index, 1)
  existingImages.value.unshift(image)
  toast.success('Главная картинка установлена')
}

// Установка главной картинки для новых изображений
function setPrimaryNewImage(index: number) {
  const image = newImageFiles.value[index]
  if (!image)
    return

  // Если есть существующие изображения, новое изображение не может стать главным напрямую
  // Нужно сначала удалить существующие или переместить новое в начало списка новых
  if (existingImages.value.length > 0) {
    // Перемещаем в начало списка новых (после сохранения будет после существующих)
    newImageFiles.value.splice(index, 1)
    newImageFiles.value.unshift(image)
    toast.info('Изображение перемещено в начало новых. Чтобы сделать его главным, удалите существующие изображения.')
    return
  }

  // Если нет существующих - просто перемещаем в начало
  if (index === 0)
    return // Уже первая

  newImageFiles.value.splice(index, 1)
  newImageFiles.value.unshift(image)
  toast.success('Главная картинка установлена')
}

// --- 8. УПРАВЛЕНИЕ АКСЕССУАРАМИ ---

const debouncedSearch = debounce(async () => {
  if (accessorySearchQuery.value.length < 2) {
    accessorySearchResults.value = []
    return
  }
  isSearchingAccessories.value = true
  accessorySearchResults.value = await productStore.searchProducts(
    accessorySearchQuery.value,
    5,
  )
  isSearchingAccessories.value = false
}, 300)

function addAccessory(product: ProductSearchResult) {
  if (!linkedAccessories.value.some(p => p.id === product.id)) {
    linkedAccessories.value.push(product)
  }
  accessorySearchQuery.value = ''
  accessorySearchResults.value = []
}

function removeAccessory(productId: string) {
  // @ts-expect-error - Deep type instantiation with union types in filter
  linkedAccessories.value = linkedAccessories.value.filter((p: ProductWithImages | ProductSearchResult) => p.id !== productId)
}

// --- 9. ОТПРАВКА ФОРМЫ ---

function handleSubmit() {
  if (!formData.value) {
    return
  }

  if (!formData.value.name || !formData.value.slug) {
    toast.error('❌ Название и Слаг - обязательные поля')
    return
  }

  formData.value.accessory_ids = linkedAccessories.value.map(p => p.id)
  formData.value.sku = formData.value.sku || null

  const productData = { ...formData.value }

  // Собираем значения select/color атрибутов
  const selectValues = Object.entries(productAttributeValues.value).map(([attrId, optId]) => ({
    attribute_id: Number(attrId),
    option_id: optId,
  }))

  // Собираем значения числовых атрибутов
  const numericValues = Object.entries(numericAttributeValues.value).map(([attrId, numVal]) => ({
    attribute_id: Number(attrId),
    option_id: null,
    numeric_value: numVal,
  }))

  const valuesToSave = [...selectValues, ...numericValues]

  if (props.initialData) {
    emit('update', {
      data: productData as ProductUpdate,
      newImageFiles: newImageFiles.value,
      imagesToDelete: imagesToDelete.value,
      existingImages: existingImages.value,
      attributeValues: valuesToSave,
    })
  }
  else {
    emit('create', {
      data: productData as ProductInsert,
      newImageFiles: newImageFiles.value,
      attributeValues: valuesToSave,
    })
  }
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

// --- 10. ИНИЦИАЛИЗАЦИЯ ---

onMounted(() => {
  if (categoriesStore.allCategories.length === 0) {
    categoriesStore.fetchAllCategories()
  }
  if (productStore.brands.length === 0) {
    productStore.fetchAllBrands()
  }
  if (productStore.countries.length === 0) {
    productStore.fetchAllCountries()
  }
  if (productStore.materials.length === 0) {
    productStore.fetchAllMaterials()
  }
  if (suppliersStore.suppliers.length === 0) {
    suppliersStore.fetchSuppliers()
  }
})

// --- 11. COMPUTED ДЛЯ ДВУСТОРОННЕЙ ПРИВЯЗКИ ---

const skuValue = computed({
  get() { return formData.value.sku ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.sku = value || null
    }
  },
})

const barcodeValue = computed({
  get() { return formData.value.barcode ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.barcode = value || null
    }
  },
})

const descriptionValue = computed({
  get() { return formData.value.description ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.description = value || null
    }
  },
})

const minAgeYearsValue = computed({
  get() { return formData.value.min_age_years ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.min_age_years = typeof value === 'number' ? value : null
    }
  },
})

const maxAgeYearsValue = computed({
  get() { return formData.value.max_age_years ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.max_age_years = typeof value === 'number' ? value : null
    }
  },
})

// --- 12. АКТУАЛЬНАЯ ЦЕНА СО СКИДКОЙ ---

const discountedPrice = computed(() => {
  const price = formData.value.price || 0
  const discount = formData.value.discount_percentage || 0
  if (discount > 0 && price > 0) {
    return Math.round(price * (1 - discount / 100))
  }
  return null
})

// --- 13. СКИДКА И ПОРЯДОК ---

const discountPercentageValue = computed({
  get() { return formData.value.discount_percentage ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.discount_percentage = typeof value === 'number' && value > 0 ? value : 0
    }
  },
})

const featuredOrderValue = computed({
  get() { return formData.value.featured_order ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.featured_order = typeof value === 'number' ? value : 0
    }
  },
})

const priceValue = computed({
  get() { return formData.value.price ?? 0 },
  set(value) {
    if (formData.value) {
      formData.value.price = typeof value === 'number' && value >= 0 ? value : 0
    }
  },
})

const costPriceValue = computed({
  get() { return formData.value.cost_price ?? 0 },
  set(value) {
    if (formData.value) {
      formData.value.cost_price = typeof value === 'number' && value >= 0 ? value : 0
    }
  },
})

const marginPercent = computed(() => {
  const price = formData.value.price || 0
  const cost = formData.value.cost_price || 0
  if (!price || !cost) return null
  return Math.round(((price - cost) / price) * 100)
})

// --- КАЛЬКУЛЯЦИЯ РАСХОДОВ И ЧИСТОЙ ПРИБЫЛИ ---
const acquiringRate = ref(1.5)
const TAX_RATE = 0.04

const priceBreakdown = computed(() => {
  const price = formData.value.price || 0
  if (!price) return null

  const discount = formData.value.discount_percentage || 0
  const sellingPrice = discount > 0 ? Math.round(price * (1 - discount / 100)) : price
  const discountAmount = price - sellingPrice
  const costPrice = formData.value.cost_price || 0
  const tax = Math.round(sellingPrice * TAX_RATE)
  const acquiring = Math.round(sellingPrice * acquiringRate.value / 100)
  const bonusPoints = formData.value.bonus_points_award || 0
  const totalExpenses = costPrice + tax + acquiring
  const netProfitBeforeBonus = sellingPrice - totalExpenses
  const netProfit = netProfitBeforeBonus - bonusPoints
  const netMargin = sellingPrice > 0 ? Math.round((netProfit / sellingPrice) * 100) : 0

  return {
    price,
    sellingPrice,
    discountAmount,
    costPrice,
    tax,
    acquiring,
    bonusPoints,
    totalExpenses,
    netProfit,
    netMargin,
  }
})

const stockQuantityValue = computed({
  get() { return formData.value.stock_quantity ?? 0 },
  set(value) {
    if (formData.value) {
      formData.value.stock_quantity = typeof value === 'number' && value >= 0 ? value : 0
    }
  },
})

const pieceCountValue = computed({
  get() { return formData.value.piece_count ?? undefined },
  set(value) {
    if (formData.value) {
      formData.value.piece_count = typeof value === 'number' && value > 0 ? value : null
    }
  },
})

// Показываем поле "Количество деталей" только если у категории есть атрибут типа number_range
const hasPieceCountAttribute = computed(() => {
  const hasAttr = categoryAttributes.value.some(attr => attr.display_type === 'number_range')
  console.log('🔍 hasPieceCountAttribute:', hasAttr, 'categoryAttributes:', categoryAttributes.value.map(a => ({ name: a.name, type: a.display_type })))
  return hasAttr
})

// Атрибуты для отображения в секции "Характеристики" (без number_range - он заменён на piece_count)
// Select и color атрибуты
const displayableAttributes = computed(() => {
  return categoryAttributes.value.filter(attr => attr.display_type !== 'number_range' && attr.display_type !== 'numeric')
})

// Числовые атрибуты (display_type === 'numeric')
const numericAttributes = computed(() => {
  return categoryAttributes.value.filter(attr => attr.display_type === 'numeric')
})

// --- 14. SEO ПОЛЯ ---

const seoDescriptionValue = computed({
  get() { return formData.value.seo_description ?? '' },
  set(value) {
    if (formData.value) {
      formData.value.seo_description = value || null
    }
  },
})

const seoKeywordsString = computed({
  get() {
    return formData.value.seo_keywords?.join(', ') ?? ''
  },
  set(value: string) {
    if (formData.value) {
      const keywords = value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0)
      formData.value.seo_keywords = keywords.length > 0 ? keywords : null
    }
  },
})

</script>

<template>
  <form v-if="formData" class="grid grid-cols-1 lg:grid-cols-3 gap-8" @submit.prevent="handleSubmit">
    <!-- 📍 Левая колонка: Основная информация и контент -->
    <div class="lg:col-span-2 space-y-6">
      <!-- ℹ️ Основная информация -->
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="name">Название товара *</Label>
            <Input
              id="name"
              v-model="formData.name"
              placeholder="Например: Развивающая игрушка для младенцев"
            />
          </div>
          <div>
            <Label for="slug">Слаг (URL) *</Label>
            <Input
              id="slug"
              v-model="formData.slug"
              placeholder="razvivayushchaya-igrushka"
              @input="onSlugInput"
            />
          </div>
          <div>
            <Label for="sku">Артикул (SKU)</Label>
            <Input
              id="sku"
              v-model="skuValue"
              placeholder="Уникальный код товара"
            />
          </div>
          <div>
            <Label for="barcode">Штрихкод (Barcode)</Label>
            <Input
              id="barcode"
              v-model="barcodeValue"
              placeholder="Например, 4601234567890"
            />
          </div>
          <div>
            <Label for="description">Описание</Label>
            <Textarea
              id="description"
              v-model="descriptionValue"
              placeholder="Подробное описание товара, его особенности и преимущества..."
              rows="5"
            />
          </div>
        </CardContent>
      </Card>

      <!-- 🔍 SEO оптимизация -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Icon name="lucide:search" class="w-5 h-5" />
            SEO оптимизация
          </CardTitle>
          <CardDescription>
            Эти данные помогут товару лучше отображаться в Google и Яндекс
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <div class="flex items-center justify-between">
              <Label for="seo_description">SEO описание</Label>
              <span
                class="text-xs"
                :class="seoDescriptionValue.length > 160 ? 'text-destructive' : seoDescriptionValue.length > 120 ? 'text-amber-500' : 'text-muted-foreground'"
              >
                {{ seoDescriptionValue.length }}/160
              </span>
            </div>
            <Textarea
              id="seo_description"
              v-model="seoDescriptionValue"
              placeholder="Купить развивающую игрушку в Алматы. Доставка по Казахстану. Бонусы за покупку."
              rows="3"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Это описание показывается в результатах Google. Оптимально 120-160 символов.
            </p>
          </div>

          <div>
            <Label for="seo_keywords">Ключевые слова</Label>
            <Input
              id="seo_keywords"
              v-model="seoKeywordsString"
              placeholder="игрушки для детей, развивающие игрушки, купить в Алматы"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Введите ключевые слова через запятую. Они помогут поисковикам найти товар.
            </p>
          </div>

          <!-- Предпросмотр в Google -->
          <div v-if="formData.name" class="p-4 bg-muted/50 rounded-lg space-y-1">
            <p class="text-xs text-muted-foreground mb-2">
              Предпросмотр в Google:
            </p>
            <p class="text-blue-600 text-base hover:underline cursor-pointer truncate">
              {{ formData.name }} - Купить в интернет-магазине | Ухтышка
            </p>
            <p class="text-green-700 text-xs">
              uhti.kz › catalog › products › {{ formData.slug || '...' }}
            </p>
            <p class="text-sm text-muted-foreground line-clamp-2">
              {{ seoDescriptionValue || formData.description || 'Описание товара будет показано здесь...' }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 💰 Цена и бонусы -->
      <Card>
        <CardHeader>
          <CardTitle>Цена, бонусы и скидка</CardTitle>
        </CardHeader>
        <CardContent class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label for="price">Цена в ₸ *</Label>
            <Input
              id="price"
              v-model.number="priceValue"
              type="number"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <Label for="cost_price">Закупочная цена (₸)</Label>
            <Input
              id="cost_price"
              v-model.number="costPriceValue"
              type="number"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <Label for="discount_percentage">Скидка (%)</Label>
            <Input
              id="discount_percentage"
              v-model.number="discountPercentageValue"
              type="number"
              min="0"
              max="100"
              placeholder="0-100"
            />
          </div>
          <div>
            <Label for="acquiring_rate">Эквайринг (%)</Label>
            <Input
              id="acquiring_rate"
              v-model.number="acquiringRate"
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="1.5"
            />
          </div>
          <!-- Калькуляция расходов -->
          <div v-if="priceBreakdown" class="sm:col-span-2 p-4 bg-muted/50 border rounded-lg space-y-2 text-sm">
            <p class="font-semibold text-base mb-3">
              Калькуляция на единицу
            </p>
            <!-- Цена продажи -->
            <div class="flex justify-between">
              <span class="text-muted-foreground">Цена продажи:</span>
              <span class="font-medium">{{ formatPrice(priceBreakdown.price) }} ₸</span>
            </div>
            <!-- Скидка -->
            <div v-if="priceBreakdown.discountAmount > 0" class="flex justify-between text-destructive">
              <span>Скидка ({{ formData.discount_percentage }}%):</span>
              <span class="font-medium">-{{ formatPrice(priceBreakdown.discountAmount) }} ₸</span>
            </div>
            <!-- Цена после скидки -->
            <div v-if="priceBreakdown.discountAmount > 0" class="flex justify-between font-semibold border-t pt-2">
              <span>Цена со скидкой:</span>
              <span>{{ formatPrice(priceBreakdown.sellingPrice) }} ₸</span>
            </div>
            <!-- Разделитель расходов -->
            <div class="border-t pt-2 mt-1 space-y-2">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Себестоимость:</span>
                <span class="font-medium text-destructive">-{{ formatPrice(priceBreakdown.costPrice) }} ₸</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">ИПН (4%):</span>
                <span class="font-medium text-destructive">-{{ formatPrice(priceBreakdown.tax) }} ₸</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Эквайринг ({{ acquiringRate }}%):</span>
                <span class="font-medium text-destructive">-{{ formatPrice(priceBreakdown.acquiring) }} ₸</span>
              </div>
              <div v-if="priceBreakdown.bonusPoints > 0" class="flex justify-between">
                <span class="text-muted-foreground">Бонусы клиенту ({{ selectedBonusPercent }}%):</span>
                <span class="font-medium text-destructive">-{{ formatPrice(priceBreakdown.bonusPoints) }} ₸</span>
              </div>
            </div>
            <!-- Итого расходы -->
            <div class="flex justify-between border-t pt-2 text-muted-foreground">
              <span>Итого расходы + бонусы:</span>
              <span class="font-medium">{{ formatPrice(priceBreakdown.totalExpenses + priceBreakdown.bonusPoints) }} ₸</span>
            </div>
            <!-- Чистая прибыль -->
            <div
              class="flex justify-between border-t pt-2 font-bold text-base"
              :class="priceBreakdown.netProfit > 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'"
            >
              <span>Чистая прибыль:</span>
              <span>{{ formatPrice(priceBreakdown.netProfit) }} ₸ ({{ priceBreakdown.netMargin }}%)</span>
            </div>
            <!-- Предупреждение о низкой марже -->
            <div
              v-if="priceBreakdown.netMargin < 10 && priceBreakdown.sellingPrice > 0"
              class="flex items-center gap-2 p-2 rounded-lg text-xs font-medium"
              :class="priceBreakdown.netProfit <= 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'"
            >
              <Icon :name="priceBreakdown.netProfit <= 0 ? 'lucide:alert-triangle' : 'lucide:alert-circle'" class="w-4 h-4 shrink-0" />
              <span v-if="priceBreakdown.netProfit <= 0">Товар продаётся в убыток! Проверьте цену, скидку и бонусы.</span>
              <span v-else>Маржа ниже 10%. Рекомендуется пересмотреть условия.</span>
            </div>
          </div>
          <div class="p-3 bg-muted/50 rounded-md sm:col-span-2">
            <Label>Процент начисляемых бонусов</Label>
            <Select v-model.number="selectedBonusPercent">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in bonusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-sm text-muted-foreground mt-2">
              Будет начислено:
              <span class="font-bold text-primary">
                {{ formData.bonus_points_award || 0 }} бонусов
              </span>
              <span v-if="discountedPrice" class="text-xs">
                (от цены со скидкой {{ formatPrice(discountedPrice) }} ₸)
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 🏷️ Характеристики (Select/Color) -->
      <Card v-if="displayableAttributes.length > 0">
        <CardHeader>
          <CardTitle>Характеристики</CardTitle>
          <CardDescription>
            Заполните значения для фильтров, привязанных к выбранной категории.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-for="attribute in displayableAttributes" :key="attribute.id">
            <Label>{{ attribute.name }}</Label>
            <Select
              v-if="attribute.display_type === 'select' || attribute.display_type === 'color'"
              v-model="productAttributeValues[attribute.id]"
            >
              <SelectTrigger>
                <SelectValue :placeholder="`Выберите ${attribute.name.toLowerCase()}`" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не выбрано
                </SelectItem>
                <SelectItem
                  v-for="option in attribute.attribute_options"
                  :key="option.id"
                  :value="option.id"
                >
                  {{ option.value }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <!-- 📏 Числовые характеристики -->
      <Card v-if="numericAttributes.length > 0">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Icon name="lucide:ruler" class="w-5 h-5" />
            Числовые характеристики
          </CardTitle>
          <CardDescription>
            Укажите числовые значения для фильтров (высота, вес и т.д.)
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-for="attribute in numericAttributes" :key="attribute.id">
            <Label :for="`numeric-attr-${attribute.id}`" class="flex items-center gap-2">
              {{ attribute.name }}
              <span v-if="attribute.unit" class="text-muted-foreground text-xs">
                ({{ attribute.unit }})
              </span>
            </Label>
            <Input
              :id="`numeric-attr-${attribute.id}`"
              :model-value="numericAttributeValues[attribute.id] ?? undefined"
              type="number"
              :placeholder="`Например: 50${attribute.unit ? ` ${attribute.unit}` : ''}`"
              min="0"
              step="any"
              @update:model-value="(val) => numericAttributeValues[attribute.id] = val ? Number(val) : null"
            />
          </div>
        </CardContent>
      </Card>

      <!-- 🛍️ Сопутствующие товары -->
      <Card>
        <CardHeader>
          <CardTitle>Сопутствующие товары</CardTitle>
          <CardDescription>
            Привяжите аксессуары, например, батарейки или подарочную упаковку.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="accessory-search">Добавить аксессуар</Label>
            <Input
              id="accessory-search"
              v-model="accessorySearchQuery"
              placeholder="Начните вводить название..."
              @input="debouncedSearch"
            />
            <div v-if="isSearchingAccessories" class="text-sm text-muted-foreground p-2">
              ⏳ Поиск...
            </div>
            <div v-if="accessorySearchResults.length > 0" class="border rounded-md mt-1 p-1 space-y-1">
              <div
                v-for="product in accessorySearchResults"
                :key="product.id"
                class="cursor-pointer hover:bg-muted p-2 rounded-md flex justify-between items-center transition"
                @click="addAccessory(product)"
              >
                <span>{{ product.name }}</span>
                <span class="text-xs text-muted-foreground">{{ product.price }} ₸</span>
              </div>
            </div>
          </div>
          <div v-if="linkedAccessories.length > 0" class="space-y-2">
            <p class="text-sm font-medium">
              ✅ Привязанные аксессуары ({{ linkedAccessories.length }}):
            </p>
            <div v-for="acc in linkedAccessories" :key="acc.id" class="flex items-center justify-between bg-muted p-2 rounded-md text-sm">
              <span>{{ acc.name }}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-6 w-6"
                @click="removeAccessory(acc.id)"
              >
                <svg width="15" height="15" viewBox="0 0 15 15">
                  <path
                    fill="currentColor"
                    d="M11.782 4.032a.575.575 0 1 0-.813-.814L7.5 6.687L4.032 3.218a.575.575 0 0 0-.814.814L6.687 7.5l-3.469 3.468a.575.575 0 0 0 .814.814L7.5 8.313l3.469 3.469a.575.575 0 0 0 .813-.814L8.313 7.5l3.469-3.468Z"
                  />
                </svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- 🎨 Правая колонка -->
    <div class="lg:col-span-1 space-y-6">
      <!-- 🏢 Организация -->
      <Card>
        <CardHeader>
          <CardTitle>Организация</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label>Категория</Label>
            <Select v-model="formData.category_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="cat in categoriesStore.allCategories"
                  :key="cat.id"
                  :value="cat.id"
                >
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center space-x-2 pt-2">
            <Switch id="is_featured" v-model:model-value="formData.is_featured" />
            <Label for="is_featured" class="mb-0 cursor-pointer">
              🎁 Товар дня (показывать в карусели)
            </Label>
          </div>

          <div v-if="formData.is_featured" class="pt-2">
            <Label for="featured_order">Порядок в карусели</Label>
            <Input
              id="featured_order"
              v-model.number="featuredOrderValue"
              type="number"
              placeholder="0 - первый, 1 - второй..."
              min="0"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Чем меньше число, тем раньше показывается
            </p>
          </div>

          <div>
            <Label>Бренд (опционально)</Label>
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  <span v-if="formData.brand_id" class="truncate">
                    {{ brands.find(b => b.id === formData.brand_id)?.name }}
                  </span>
                  <span v-else class="text-muted-foreground">
                    Выберите бренд...
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[--radix-popover-trigger-width] p-0">
                <Command v-model:model-value="brandSearchQuery">
                  <CommandInput placeholder="Поиск или создание бренда..." />
                  <CommandList>
                    <CommandEmpty>
                      <div
                        class="relative cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
                        @click="() => { isBrandDialogOpen = true }"
                      >
                        ➕ Создать новый бренд
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        @select="() => { formData.brand_id = null }"
                      >
                        Без бренда
                      </CommandItem>
                      <CommandItem
                        v-for="brand in filteredBrands"
                        :key="brand.id"
                        :value="brand.name"
                        @select="() => { formData.brand_id = brand.id }"
                      >
                        <Check
                          :class="formData.brand_id === brand.id ? 'opacity-100' : 'opacity-0'"
                          class="mr-2 h-4 w-4"
                        />
                        {{ brand.name }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Dialog v-model:open="isBrandDialogOpen">
              <DialogContent class="sm:max-w-[625px]">
                <DialogHeader>
                  <DialogTitle>Создать новый бренд</DialogTitle>
                </DialogHeader>
                <BrandForm :initial-name="brandSearchQuery" @submit="handleBrandCreate" />
              </DialogContent>
            </Dialog>
          </div>

          <!-- Линейка продуктов (показывается только если выбран бренд) -->
          <div v-if="formData.brand_id">
            <Label>Линейка (опционально)</Label>
            <p class="text-xs text-muted-foreground mb-2">
              Например: Barbie, Hot Wheels для Mattel
            </p>
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                  :disabled="isLoadingProductLines"
                >
                  <span v-if="isLoadingProductLines" class="text-muted-foreground">
                    Загрузка...
                  </span>
                  <span v-else-if="formData.product_line_id" class="truncate">
                    {{ brandProductLines.find(l => l.id === formData.product_line_id)?.name }}
                  </span>
                  <span v-else class="text-muted-foreground">
                    Выберите линейку...
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[--radix-popover-trigger-width] p-0">
                <Command v-model:model-value="productLineSearchQuery">
                  <CommandInput placeholder="Поиск или создание линейки..." />
                  <CommandList>
                    <CommandEmpty>
                      <div
                        class="relative cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
                        @click="() => { isProductLineDialogOpen = true }"
                      >
                        ➕ Создать новую линейку
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        @select="() => { formData.product_line_id = null }"
                      >
                        Без линейки
                      </CommandItem>
                      <CommandItem
                        v-for="line in filteredProductLines"
                        :key="line.id"
                        :value="line.name"
                        @select="() => { formData.product_line_id = line.id }"
                      >
                        <Check
                          :class="formData.product_line_id === line.id ? 'opacity-100' : 'opacity-0'"
                          class="mr-2 h-4 w-4"
                        />
                        {{ line.name }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Dialog v-model:open="isProductLineDialogOpen">
              <DialogContent class="sm:max-w-[525px]">
                <DialogHeader>
                  <DialogTitle>Создать новую линейку</DialogTitle>
                  <DialogDescription>
                    Линейка для бренда: {{ brands.find(b => b.id === formData.brand_id)?.name }}
                  </DialogDescription>
                </DialogHeader>
                <ProductLineForm
                  :brand-id="formData.brand_id!"
                  :initial-name="productLineSearchQuery"
                  @submit="handleProductLineCreate"
                />
              </DialogContent>
            </Dialog>
          </div>

          <!-- Поставщик -->
          <div>
            <Label>Поставщик</Label>
            <Select v-model="formData.supplier_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите поставщика" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не указан
                </SelectItem>
                <SelectItem
                  v-for="s in suppliers"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-muted-foreground mt-1">
              <NuxtLink to="/admin/suppliers" target="_blank" class="text-primary hover:underline">
                Управление поставщиками
              </NuxtLink>
            </p>
          </div>

          <div>
            <Label>Страна происхождения</Label>
            <Select v-model="formData.origin_country_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите страну" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не указана
                </SelectItem>
                <SelectItem
                  v-for="country in countries"
                  :key="country.id"
                  :value="country.id"
                >
                  {{ country.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Материал</Label>
            <Select v-model="formData.material_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите материал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не указан
                </SelectItem>
                <SelectItem
                  v-for="material in materials"
                  :key="material.id"
                  :value="material.id"
                >
                  {{ material.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="stock">Количество на складе</Label>
            <Input
              id="stock"
              v-model.number="stockQuantityValue"
              type="number"
              placeholder="0"
              min="0"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <Label for="min_stock_level">
                Мин. остаток
              </Label>
              <Input
                id="min_stock_level"
                v-model.number="formData.min_stock_level"
                type="number"
                placeholder="2"
                min="0"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Ниже этого — в список закупок
              </p>
            </div>
            <div>
              <Label for="restock_quantity">
                Дозаказать (шт)
              </Label>
              <Input
                id="restock_quantity"
                v-model.number="formData.restock_quantity"
                type="number"
                placeholder="5"
                min="1"
              />
              <p class="text-xs text-muted-foreground mt-1">
                Сколько заказывать
              </p>
            </div>
          </div>

          <!-- Поле "Количество деталей" только для категорий с атрибутом number_range (конструкторы) -->
          <div v-if="hasPieceCountAttribute">
            <Label for="piece_count" class="flex items-center gap-2">
              <Icon name="lucide:puzzle" class="w-4 h-4 text-muted-foreground" />
              Количество деталей
            </Label>
            <Input
              id="piece_count"
              v-model.number="pieceCountValue"
              type="number"
              placeholder="Например: 175"
              min="1"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Для конструкторов. Используется в фильтрах.
            </p>
          </div>

          <div class="flex items-center space-x-2 pt-2">
            <Switch id="is_active" v-model:model-value="formData.is_active" />
            <Label for="is_active" class="mb-0 cursor-pointer">
              ✨ Активен для продажи
            </Label>
          </div>

          <div class="pt-2">
            <Label for="gender">Пол</Label>
            <Select v-model="formData.gender">
              <SelectTrigger id="gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unisex">
                  👥 Унисекс
                </SelectItem>
                <SelectItem value="male">
                  👦 Для мальчиков
                </SelectItem>
                <SelectItem value="female">
                  👧 Для девочек
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="grid grid-cols-2 gap-4 pt-2">
            <div>
              <Label for="min_age_years">Мин. возраст (лет)</Label>
              <Input
                id="min_age_years"
                v-model.number="minAgeYearsValue"
                type="number"
                placeholder="0"
                min="0"
                max="100"
              />
            </div>
            <div>
              <Label for="max_age_years">Макс. возраст (лет)</Label>
              <Input
                id="max_age_years"
                v-model.number="maxAgeYearsValue"
                type="number"
                placeholder="100"
                min="0"
                max="100"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 🖼️ Галерея изображений -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="flex items-center gap-2">
            <Icon name="lucide:images" class="w-5 h-5" />
            Фото товара
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 🎯 Кнопка загрузки (мобильный) + Drag & Drop (десктоп) -->
          <div
            class="border-2 border-dashed rounded-xl p-4 sm:p-6 text-center transition-colors cursor-pointer active:scale-[0.98]"
            :class="[
              isDraggingOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50 active:border-primary',
            ]"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="fileInput?.click()"
          >
            <div class="flex flex-col items-center gap-3">
              <div class="w-14 h-14 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon name="lucide:camera" class="w-7 h-7 sm:w-6 sm:h-6 text-primary" />
              </div>
              <div class="space-y-1">
                <p class="font-semibold text-base sm:text-sm">
                  Добавить фото
                </p>
                <p class="text-xs text-muted-foreground hidden sm:block">
                  Перетащите или нажмите для выбора
                </p>
                <p class="text-xs text-muted-foreground sm:hidden">
                  Нажмите для выбора из галереи
                </p>
              </div>
            </div>
            <input
              :key="fileInputKey"
              ref="fileInput"
              type="file"
              multiple
              accept="image/*"
              capture="environment"
              class="hidden"
              :disabled="isProcessingImages"
              @change="handleFilesChange"
            >
          </div>

          <!-- ⏳ Индикатор загрузки -->
          <div v-if="isProcessingImages" class="flex items-center justify-center gap-3 py-6 bg-muted/30 rounded-xl">
            <div class="w-6 h-6 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
            <span class="text-sm font-medium">Обработка...</span>
          </div>

          <!-- 📊 Счётчик изображений -->
          <div v-if="existingImages.length > 0 || newImageFiles.length > 0" class="flex flex-wrap items-center justify-center gap-2 p-3 bg-muted/50 rounded-xl">
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg">
              <Icon name="lucide:images" class="w-4 h-4 text-muted-foreground" />
              <span class="text-sm font-semibold">{{ existingImages.length + newImageFiles.length }}</span>
            </div>
            <div v-if="existingImages.length > 0" class="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Icon name="lucide:check-circle" class="w-4 h-4 text-green-600" />
              <span class="text-sm text-green-700 dark:text-green-400">{{ existingImages.length }}</span>
            </div>
            <div v-if="newImageFiles.length > 0" class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Icon name="lucide:plus-circle" class="w-4 h-4 text-blue-600" />
              <span class="text-sm text-blue-700 dark:text-blue-400">{{ newImageFiles.length }}</span>
            </div>
          </div>

          <!-- 🎨 ГАЛЕРЕЯ ИЗОБРАЖЕНИЙ -->
          <div v-if="existingImages.length > 0 || newImageFiles.length > 0" class="space-y-4">
            <!-- ⭐ Секция: Существующие изображения -->
            <div v-if="existingImages.length > 0" class="space-y-3">
              <div class="flex items-center gap-2">
                <Icon name="lucide:image" class="w-4 h-4 text-green-500" />
                <p class="text-sm font-semibold text-green-600 dark:text-green-400">
                  Сохранённые ({{ existingImages.length }})
                </p>
              </div>

              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div
                  v-for="(image, index) in existingImages"
                  :key="image.id"
                  class="relative rounded-xl overflow-hidden border-2 transition-all bg-muted"
                  :class="index === 0 ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-muted'"
                >
                  <!-- Изображение -->
                  <div class="aspect-square">
                    <img
                      :src="getExistingImageUrl(image.image_url) || '/images/placeholder.svg'"
                      class="w-full h-full object-cover"
                      loading="lazy"
                      alt="Изображение товара"
                      @error="(e: Event) => (e.target as HTMLImageElement).src = '/images/placeholder.svg'"
                    >
                  </div>
                  <!-- Бейдж главного изображения -->
                  <div
                    v-if="index === 0"
                    class="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 shadow-lg"
                  >
                    <Icon name="lucide:star" class="w-3 h-3" />
                    <span class="hidden xs:inline">Главное</span>
                  </div>
                  <!-- Панель действий (всегда видна) -->
                  <div class="flex items-center justify-between gap-1 p-2 bg-background/95 backdrop-blur-sm border-t">
                    <!-- Сделать главной -->
                    <Button
                      v-if="index > 0"
                      type="button"
                      variant="outline"
                      size="sm"
                      class="flex-1 h-10 text-xs gap-1"
                      @click="setPrimaryExistingImage(index)"
                    >
                      <Icon name="lucide:star" class="w-4 h-4" />
                      <span class="hidden xs:inline">Главное</span>
                    </Button>
                    <div v-else class="flex-1 h-10 flex items-center justify-center text-xs text-muted-foreground">
                      <Icon name="lucide:check" class="w-4 h-4 mr-1 text-amber-500" />
                      <span class="hidden xs:inline">Это главное</span>
                    </div>
                    <!-- Удалить -->
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      class="h-10 w-10 sm:w-auto sm:px-3"
                      @click="removeExistingImage(image)"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                      <span class="hidden sm:inline ml-1">Удалить</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 📤 Секция: Новые изображения -->
            <div v-if="newImageFiles.length > 0" class="space-y-3">
              <div class="flex items-center gap-2">
                <Icon name="lucide:upload" class="w-4 h-4 text-blue-500" />
                <p class="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  Новые ({{ newImageFiles.length }})
                </p>
              </div>

              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div
                  v-for="(item, index) in newImageFiles"
                  :key="item.id"
                  class="relative rounded-xl overflow-hidden border-2 transition-all bg-muted"
                  :class="existingImages.length === 0 && index === 0 ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-blue-500/30'"
                >
                  <!-- Изображение -->
                  <div class="aspect-square">
                    <img
                      :src="item.previewUrl"
                      class="w-full h-full object-cover"
                      alt="Превью нового изображения"
                    >
                  </div>
                  <!-- Бейдж главного -->
                  <div
                    v-if="existingImages.length === 0 && index === 0"
                    class="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-lg font-bold flex items-center gap-1 shadow-lg"
                  >
                    <Icon name="lucide:star" class="w-3 h-3" />
                    <span class="hidden xs:inline">Главное</span>
                  </div>
                  <!-- Бейдж "Новое" -->
                  <div
                    v-else
                    class="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-lg font-medium shadow-lg"
                  >
                    Новое
                  </div>
                  <!-- Панель действий (всегда видна) -->
                  <div class="flex items-center justify-between gap-1 p-2 bg-background/95 backdrop-blur-sm border-t">
                    <!-- Сделать главной -->
                    <Button
                      v-if="existingImages.length > 0 || index > 0"
                      type="button"
                      variant="outline"
                      size="sm"
                      class="flex-1 h-10 text-xs gap-1"
                      @click="setPrimaryNewImage(index)"
                    >
                      <Icon name="lucide:star" class="w-4 h-4" />
                      <span class="hidden xs:inline">Главное</span>
                    </Button>
                    <div v-else class="flex-1 h-10 flex items-center justify-center text-xs text-muted-foreground">
                      <Icon name="lucide:check" class="w-4 h-4 mr-1 text-amber-500" />
                      <span class="hidden xs:inline">Это главное</span>
                    </div>
                    <!-- Удалить -->
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      class="h-10 w-10 sm:w-auto sm:px-3"
                      @click="removeNewImage(index)"
                    >
                      <Icon name="lucide:trash-2" class="w-4 h-4" />
                      <span class="hidden sm:inline ml-1">Удалить</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- ✅ Кнопка отправки -->
      <div class="sticky bottom-4 z-10">
        <Button
          type="submit"
          size="lg"
          class="w-full h-14 text-base font-semibold shadow-lg"
          :disabled="isProcessingImages"
        >
          <Icon :name="props.initialData ? 'lucide:save' : 'lucide:plus'" class="w-5 h-5 mr-2" />
          {{ props.initialData ? 'Сохранить изменения' : 'Создать товар' }}
        </Button>
      </div>
    </div>
  </form>
</template>
