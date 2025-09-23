<script setup lang="ts">
import type { AccessoryProduct, CustomFieldValue, FullProduct, ProductFormData, ProductImageRow, ProductInsert, ProductSearchResult, ProductTypeRow, ProductUpdate } from '@/types'
import { debounce } from 'lodash-es'

import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { useAdminProductTypesStore } from '@/stores/adminStore/adminProductTypesStore'
import { slugify } from '@/utils/slugify'

// --- 1. PROPS & EMITS ---
const props = defineProps<{
  initialData?: FullProduct | null
}>()
const emit = defineEmits<{
  (e: 'create', payload: {
    data: ProductInsert
    newImageFiles: File[]
    accessoryIds: string[]
  }): void

  (e: 'update', payload: {
    data: ProductUpdate
    newImageFiles: File[]
    imagesToDelete: string[]
    existingImages: ProductImageRow[]
    accessoryIds: string[]
  }): void
}>()

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ КОМПОНЕНТА ---
const formData = ref<ProductFormData>({
  name: '',
  slug: '',
  price: 0,
  is_active: true,
  stock_quantity: 0,
  description: '',
  category_id: null,
  bonus_points_award: 0,
  min_age: null,
  max_age: null,
  gender: 'unisex',
  product_type: null,
  custom_fields_data: {},
})

const bonusOptions = [
  { label: 'Стандарт (5%)', value: 5 },
  { label: 'Повышенный (20%)', value: 20 },
  { label: 'Акция (80%)', value: 80 },
  { label: 'Подарок (100%)', value: 100 },
]

// --- 3. ИНИЦИАЛИЗАЦИЯ СТОРОВ И ПЕРЕМЕННЫХ ---
const categoriesStore = useAdminCategoriesStore()
const productTypesStore = useAdminProductTypesStore()
const productStore = useAdminProductsStore()
const { getPublicUrl } = useSupabaseStorage()
const { productType } = storeToRefs(productTypesStore)

const newImageFiles = ref<{ file: File, previewUrl: string }[]>([])
const existingImages = ref<ProductImageRow[]>([])
const imagesToDelete = ref<string[]>([])
const selectedBonusPercent = ref(5)

const linkedAccessories = ref<(AccessoryProduct | ProductSearchResult)[]>([])
const accessorySearchQuery = ref('')
const accessorySearchResults = ref<ProductSearchResult[]>([])
const isSearchingAccessories = ref(false)

// --- 4. ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПРИ ЗАГРУЗКЕ ---
watch(() => props.initialData, (product) => {
  newImageFiles.value = []
  imagesToDelete.value = []
  linkedAccessories.value = []

  if (product && product.id) {
    const productCopy = JSON.parse(JSON.stringify(product)) as FullProduct

    formData.value = {
      name: productCopy.name,
      slug: productCopy.slug,
      description: productCopy.description,
      price: productCopy.price,
      category_id: productCopy.category_id,
      stock_quantity: productCopy.stock_quantity,
      is_active: productCopy.is_active,
      bonus_points_award: productCopy.bonus_points_award,
      min_age: productCopy.min_age,
      max_age: productCopy.max_age,
      gender: productCopy.gender as 'unisex' | 'male' | 'female' | null,
      product_type: productCopy.product_type,
      custom_fields_data: (
        typeof productCopy.custom_fields_data === 'object'
        && productCopy.custom_fields_data !== null
        && !Array.isArray(productCopy.custom_fields_data)
      )
        ? productCopy.custom_fields_data as Record<string, CustomFieldValue>
        : {},
    }

    existingImages.value = [...(productCopy.product_images || [])]

    if (productCopy.product_accessories && productCopy.product_accessories.length > 0) {
      linkedAccessories.value = productCopy.product_accessories
        .map(link => link.accessory)
        .filter((p): p is AccessoryProduct => p !== null) // filter также помогает TypeScript'у понять тип
    }

    if (productCopy.price > 0) {
      const percent = Math.round((productCopy.bonus_points_award / Number(productCopy.price)) * 100)
      selectedBonusPercent.value = bonusOptions.find(opt => opt.value === percent)?.value || 5
    }
    else {
      selectedBonusPercent.value = 5
    }
  }
  else {
    formData.value = {
      name: '',
      slug: '',
      price: 0,
      is_active: true,
      stock_quantity: 0,
      description: '',
      category_id: null,
      bonus_points_award: 0,
      min_age: null,
      max_age: null,
      gender: 'unisex',
      product_type: null,
      custom_fields_data: {},
    }
    existingImages.value = []
    selectedBonusPercent.value = 5
  }
})

onMounted(() => {
  categoriesStore.fetchAllCategories()
  productTypesStore.fetchAllProductTypes()
})

// --- 5. РЕАКТИВНОСТЬ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

watch(() => formData.value?.product_type, (newTypeSlug) => {
  // ПРИНУДИТЕЛЬНОЕ УТВЕРЖДЕНИЕ ТИПА ПРЯМО ПЕРЕД ИСПОЛЬЗОВАНИЕМ
  const typesArray = productType.value as ProductTypeRow[]
  const selectedType = typesArray.find(type => type.slug === newTypeSlug)

  const schema = selectedType?.custom_fields_schema
  const newCustomData: Record<string, CustomFieldValue> = (
    typeof formData.value.custom_fields_data === 'object' && formData.value.custom_fields_data !== null
  )
    ? { ...formData.value.custom_fields_data }
    : {}

  if (schema) {
    Object.keys(schema).forEach((key) => {
      const field = schema[key]
      if (field && !(key in newCustomData)) {
        newCustomData[key] = field.type === 'boolean' ? false : null
      }
    })
  }
  formData.value.custom_fields_data = newCustomData
})

const currentTypeSchema = computed(() => {
  const currentSlug = formData.value?.product_type
  if (!currentSlug) {
    return null
  }

  // ИСПОЛЬЗУЕМ ТОТ ЖЕ "СИЛОВОЙ" ПОДХОД ЗДЕСЬ
  const typesArray = productType.value as ProductTypeRow[]
  const selectedType = typesArray.find(
    t => t.slug === currentSlug,
  )

  return selectedType ? selectedType.custom_fields_schema : null
})

watch([() => formData.value.price, selectedBonusPercent], ([price, percent]) => {
  if (formData.value && price && percent) {
    formData.value.bonus_points_award = Math.round(Number(price) * (percent / 100))
  }
})

const minAgeValue = computed({
  get: () => formData.value.min_age ?? undefined,
  set: (value) => {
    if (formData.value)
      formData.value.min_age = typeof value === 'number' ? value : null
  },
})
const maxAgeValue = computed({
  get: () => formData.value.max_age ?? undefined,
  set: (value) => {
    if (formData.value)
      formData.value.max_age = typeof value === 'number' ? value : null
  },
})

const descriptionValue = computed({
  get: () => formData.value.description ?? '',
  set: (value: string) => {
    formData.value.description = value === '' ? null : value
  },
})

// const categoryIdValue = computed({
//   get: () => formData.value.category_id ?? undefined, // Select ожидает `undefined` для placeholder
//   set: (value: string | null) => {
//     formData.value.category_id = value
//   },
// })

// const productTypeValue = computed({
//   get: () => formData.value.product_type ?? undefined, // Select ожидает `undefined` для placeholder
//   set: (value: string | null) => {
//     formData.value.product_type = value
//   },
// })

// const genderValue = computed({
//   get: () => formData.value.gender ?? 'unisex',
//   set: (value: 'unisex' | 'male' | 'female' | null) => {
//     formData.value.gender = value
//   },
// })

function autoFillSlug() {
  if (formData.value?.name && !formData.value.slug) {
    formData.value.slug = slugify(formData.value.name)
  }
}

function handleFilesChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    const filesWithPreview = Array.from(target.files).map(file => ({ file, previewUrl: URL.createObjectURL(file) }))
    newImageFiles.value.push(...filesWithPreview)
    target.value = ''
  }
}

function removeNewImage(index: number) {
  const fileToRemove = newImageFiles.value[index]
  if (fileToRemove)
    URL.revokeObjectURL(fileToRemove.previewUrl)
  newImageFiles.value.splice(index, 1)
}

function removeExistingImage(image: ProductImageRow) {
  imagesToDelete.value.push(image.id)
  existingImages.value = existingImages.value.filter(img => img.id !== image.id)
}

// --- 7. УПРАВЛЕНИЕ АКСЕССУАРАМИ ---

const debouncedSearch = debounce(async () => {
  if (accessorySearchQuery.value.length < 2) {
    accessorySearchResults.value = []
    return
  }
  isSearchingAccessories.value = true
  accessorySearchResults.value = await productStore.searchProducts(accessorySearchQuery.value, 5)
  isSearchingAccessories.value = false
}, 300)

function addAccessory(product: ProductSearchResult) {
  if (!linkedAccessories.value.some(p => p.id === product.id))
    linkedAccessories.value.push(product)
  accessorySearchQuery.value = ''
  accessorySearchResults.value = []
}
function removeAccessory(productId: string) {
  linkedAccessories.value = linkedAccessories.value.filter(p => p.id !== productId)
}

function handleSubmit() {
  if (!formData.value)
    return
  if (!formData.value.name || !formData.value.slug) {
    toast.error('Название и Слаг - обязательные поля')
    return
  }

  const productData = { ...formData.value }

  const accessoryIds = linkedAccessories.value.map(p => p.id)

  if (props.initialData) {
    emit('update', {
      data: productData as ProductUpdate,
      newImageFiles: newImageFiles.value.map(item => item.file),
      imagesToDelete: imagesToDelete.value,
      existingImages: existingImages.value,
      accessoryIds,
    })
  }
  else {
    emit('create', {
      data: productData as ProductInsert,
      newImageFiles: newImageFiles.value.map(item => item.file),
      accessoryIds,
    })
  }
}
</script>

<template>
  <form v-if="formData" class="grid grid-cols-1 lg:grid-cols-3 gap-8" @submit.prevent="handleSubmit">
    <!-- Левая колонка -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Основная информация -->
      <Card>
        <CardHeader>
          <CardTitle>Основная информация</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="name">Название товара *</Label>
            <Input id="name" v-model="formData.name" @blur="autoFillSlug" />
          </div>
          <div>
            <Label for="slug">Слаг (URL) *</Label>
            <Input id="slug" v-model="formData.slug" />
          </div>
          <div>
            <Label for="description">Описание</Label>
            <Textarea id="description" v-model="descriptionValue" />
          </div>
        </CardContent>
      </Card>

      <!-- Цена и бонусы -->
      <Card>
        <CardHeader>
          <CardTitle>Цена и бонусы</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="price">Цена в ₸ *</Label>
            <Input id="price" v-model.number="formData.price" type="number" />
          </div>
          <div class="p-3 bg-muted/50 rounded-md">
            <Label>Процент бонусов</Label>
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
              Будет начислено: <span class="font-bold text-primary">{{ formData.bonus_points_award }} бонусов</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Параметры для рекомендаций -->
      <Card>
        <CardHeader>
          <CardTitle>Параметры и атрибуты</CardTitle>
          <CardDescription>Помогут рекомендовать товар и добавят доп. информацию.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <!-- Выбор типа товара -->
          <div>
            <Label for="product_type">Тип товара</Label>
            <Select v-model="formData.product_type">
              <SelectTrigger id="product_type">
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="typeOption in productTypesStore.productType" :key="typeOption.slug" :value="typeOption.slug">
                  {{ typeOption.name }}
                </SelectItem>
                <SelectItem :value="null" class="italic text-muted-foreground">
                  (Без типа)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- ДИНАМИЧЕСКИЕ ПОЛЯ -->
          <div v-if="currentTypeSchema && formData.custom_fields_data" class="space-y-4 p-4 border rounded-md">
            <div v-for="(field, key) in currentTypeSchema" :key="key">
              <div v-if="field.type === 'boolean'" class="flex items-center space-x-2">
                <Switch :id="key.toString()" @update:model-value="formData.custom_fields_data[key]" />
                <Label :for="key.toString()">{{ field.label }}</Label>
              </div>
              <div v-if="field.type === 'text'">
                <Label :for="key.toString()">{{ field.label }}</Label>
                <Input
                  :id="key.toString()"
                  :model-value="String(formData.custom_fields_data[key] ?? '')"
                  @update:model-value="newValue => {
                    if (formData.custom_fields_data) {
                      formData.custom_fields_data[key] = newValue === '' ? null : newValue
                    }
                  }"
                />
              </div>
              <!-- Сюда можно добавить рендеринг других типов полей (number, select) -->
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label for="min_age">Мин. возраст (в месяцах)</Label>
              <Input id="min_age" v-model.number="minAgeValue" type="number" />
            </div>
            <div>
              <Label for="max_age">Макс. возраст (в месяцах)</Label>
              <Input id="max_age" v-model.number="maxAgeValue" type="number" />
            </div>
          </div>
          <div>
            <Label for="gender">Пол</Label>
            <Select v-model="formData.gender">
              <SelectTrigger id="gender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unisex">
                  Унисекс
                </SelectItem>
                <SelectItem value="male">
                  Для мальчиков
                </SelectItem>
                <SelectItem value="female">
                  Для девочек
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <!-- УПРАВЛЕНИЕ АКСЕССУАРАМИ -->
      <Card v-if="formData.custom_fields_data?.needs_batteries === true">
        <CardHeader>
          <CardTitle>Сопутствующие товары</CardTitle>
          <CardDescription>Например, батарейки для этой игрушки.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="accessory-search">Добавить аксессуар</Label>
            <Input id="accessory-search" v-model="accessorySearchQuery" placeholder="Начните вводить название..." @input="debouncedSearch" />
            <div v-if="isSearchingAccessories" class="text-sm text-muted-foreground p-2">
              Поиск...
            </div>
            <div v-if="accessorySearchResults.length > 0" class="border rounded-md mt-1 p-1 space-y-1">
              <div v-for="product in accessorySearchResults" :key="product.id" class="cursor-pointer hover:bg-muted p-2 rounded-md flex justify-between items-center" @click="addAccessory(product)">
                <span>{{ product.name }}</span>
                <span class="text-xs text-muted-foreground">{{ product.price }} ₸</span>
              </div>
            </div>
          </div>
          <div v-if="linkedAccessories.length > 0" class="space-y-2">
            <p class="text-sm font-medium">
              Привязанные аксессуары:
            </p>
            <div v-for="acc in linkedAccessories" :key="acc.id" class="flex items-center justify-between bg-muted p-2 rounded-md text-sm">
              <span>{{ acc.name }}</span>
              <Button type="button" variant="ghost" size="icon" class="h-6 w-6" @click="removeAccessory(acc.id)">
                <svg width="15" height="15" viewBox="0 0 15 15"><path fill="currentColor" d="M11.782 4.032a.575.575 0 1 0-.813-.814L7.5 6.687L4.032 3.218a.575.575 0 0 0-.814.814L6.687 7.5l-3.469 3.468a.575.575 0 0 0 .814.814L7.5 8.313l3.469 3.469a.575.575 0 0 0 .813-.814L8.313 7.5l3.469-3.468Z" /></svg>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Правая колонка -->
    <div class="lg:col-span-1 space-y-6">
      <!-- Организация -->
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
                <SelectItem v-for="cat in categoriesStore.allCategories" :key="cat.id" :value="cat.id">
                  {{ cat.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="stock">Количество на складе</Label>
            <Input id="stock" v-model.number="formData.stock_quantity" type="number" />
          </div>
          <div class="flex items-center space-x-2 pt-2">
            <Switch id="is_active" @update:model-value="newValue => formData.is_active = newValue" />
            <Label for="is_active">Активен</Label>
          </div>
        </CardContent>
      </Card>

      <!-- Галерея изображений -->
      <Card>
        <CardHeader>
          <CardTitle>Галерея изображений</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-if="existingImages.length > 0" class="grid grid-cols-3 gap-2">
            <div v-for="image in existingImages" :key="image.id" class="relative group aspect-square">
              <NuxtImg :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || ''" class="w-full h-full object-cover rounded-md" />
              <Button type="button" variant="destructive" size="icon" class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" @click="removeExistingImage(image)">
                <svg width="15" height="15" viewBox="0 0 15 15"><path fill="currentColor" d="M11.782 4.032a.575.575 0 1 0-.813-.814L7.5 6.687L4.032 3.218a.575.575 0 0 0-.814.814L6.687 7.5l-3.469 3.468a.575.575 0 0 0 .814.814L7.5 8.313l3.469 3.469a.575.575 0 0 0 .813-.814L8.313 7.5l3.469-3.468Z" /></svg>
              </Button>
            </div>
          </div>
          <div v-if="newImageFiles.length > 0" class="grid grid-cols-3 gap-2">
            <div v-for="(item, index) in newImageFiles" :key="index" class="relative group aspect-square">
              <img :src="item.previewUrl" class="w-full h-full object-cover rounded-md" alt="Превью нового изображения">
              <Button type="button" variant="destructive" size="icon" class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" @click="removeNewImage(index)">
                <svg width="15" height="15" viewBox="0 0 15 15"><path fill="currentColor" d="M11.782 4.032a.575.575 0 1 0-.813-.814L7.5 6.687L4.032 3.218a.575.575 0 0 0-.814.814L6.687 7.5l-3.469 3.468a.575.575 0 0 0 .814.814L7.5 8.313l3.469 3.469a.575.575 0 0 0 .813-.814L8.313 7.5l3.469-3.468Z" /></svg>
              </Button>
            </div>
          </div>
          <div>
            <Label for="images">Добавить фото</Label>
            <Input id="images" type="file" multiple accept="image/*" @change="handleFilesChange" />
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" class="w-full">
        Сохранить товар
      </Button>
    </div>
  </form>
</template>
