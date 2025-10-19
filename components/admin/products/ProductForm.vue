<script setup lang="ts">
import type { AttributeWithValue, BrandInsert, BrandUpdate, FullProduct, ProductAttributeValueInsert, ProductFormData, ProductImageRow, ProductInsert, ProductSearchResult, ProductUpdate, ProductWithImages } from '@/types'
import { debounce } from 'lodash-es'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'
import { slugify } from '@/utils/slugify'
import BrandForm from '../brands/BrandForm.vue'

// --- 1. PROPS & EMITS ---
const props = defineProps<{
  initialData?: FullProduct | null
}>()

const emit = defineEmits<{
  (e: 'create',
    payload:
    { data: ProductInsert, newImageFiles: File[], attributeValues: ProductAttributeValueInsert[] }
  ): void
  (e: 'update',
    payload:
    {
      data: ProductUpdate
      newImageFiles: File[]
      imagesToDelete: string[]
      existingImages: ProductImageRow[]
      attributeValues: ProductAttributeValueInsert[]
    }
  ): void
}>()

// --- 2. ИНИЦИАЛИЗАЦИЯ СТОРОВ ---
const categoriesStore = useAdminCategoriesStore()
const productStore = useAdminProductsStore()
const brandsStore = useAdminBrandsStore()
const { getPublicUrl } = useSupabaseStorage()

const { brands, countries, materials } = storeToRefs(productStore)

// --- 3. ЛОКАЛЬНОЕ СОСТОЯНИЕ КОМПОНЕНТА ---
const formData = ref<Partial<ProductFormData>>({})
const isBrandDialogOpen = ref(false)
const categoryAttributes = ref<AttributeWithValue[]>([])
const productAttributeValues = ref<Record<number, number | null>>({})

const bonusOptions = [
  { label: 'Стандарт (5%)', value: 5 },
  { label: 'Повышенный (20%)', value: 20 },
  { label: 'Акция (80%)', value: 80 },
  { label: 'Подарок (100%)', value: 100 },
]

const newImageFiles = ref<{ file: File, previewUrl: string }[]>([])
const existingImages = ref<ProductImageRow[]>([])
const imagesToDelete = ref<string[]>([])
const selectedBonusPercent = ref(5)

const linkedAccessories = ref<(ProductWithImages | ProductSearchResult)[]>([])
const accessorySearchQuery = ref('')
const accessorySearchResults = ref<ProductSearchResult[]>([])
const isSearchingAccessories = ref(false)
const brandSearchQuery = ref('')

// --- 4. ИНИЦИАЛИЗАЦИЯ ДАННЫХ ПРИ ЗАГРУЗКЕ ---

// <-- ИЗМЕНЕНО: Функция теперь принимает правильный тип
function setupFormData(product: FullProduct | null | undefined) {
  newImageFiles.value = []
  imagesToDelete.value = []
  linkedAccessories.value = []

  if (product && product.id) {
    // --- РЕЖИИМ РЕДАКТИРОВАНИЯ ---
    formData.value = {
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
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
      origin_country_id: product.origin_country_id,
      discount_percentage: product.discount_percentage || 0,
      material_id: product.material_id,
      barcode: product.barcode,
    }
    existingImages.value = [...(product.product_images || [])]

    if (product.accessory_ids && product.accessory_ids.length > 0)
      productStore.fetchProductsByIds(product.accessory_ids).then(data => linkedAccessories.value = data)

    if (product.price > 0 && product.bonus_points_award) {
      const percent = Math.round((product.bonus_points_award / Number(product.price)) * 100)
      selectedBonusPercent.value = bonusOptions.find(opt => opt.value === percent)?.value || 5
    }
  }
  else {
    // --- РЕЖИМ СОЗДАНИЯ ---
    formData.value = {
      name: '',
      slug: '',
      price: 0,
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
      origin_country_id: null,
      discount_percentage: 0,
      material_id: null,
      barcode: null,
    }
    existingImages.value = []
    selectedBonusPercent.value = 5
  }
}

// <-- ИЗМЕНЕНО: Используем чистую обертку для вызова setupFormData
watch(
  () => props.initialData,
  (newProduct) => {
    setupFormData(newProduct)
  },
  { immediate: true },
)

const filteredBrands = computed(() => {
  if (!brandSearchQuery.value) {
    return brands.value
  }
  return brands.value.filter(brand =>
    brand.name.toLowerCase().includes(brandSearchQuery.value.toLowerCase()),
  )
})

async function handleBrandCreate(payload: { data: BrandInsert | BrandUpdate, file: File | null }) {
  const newBrand = await brandsStore.createBrand(payload.data as BrandInsert, payload.file)
  if (newBrand) {
    isBrandDialogOpen.value = false // Закрываем модальное окно

    // Обновляем списки
    await brandsStore.fetchBrands()
    await productStore.fetchAllBrands()

    // Автоматически выбираем новый бренд
    await nextTick()
    formData.value.brand_id = newBrand.id
    brandSearchQuery.value = '' // Очищаем поиск
  }
}
// Эта функция будет вызываться, когда меняется категория товара
async function handleCategoryChange(categoryId: string | null) {
  if (!categoryId) {
    categoryAttributes.value = []
    return
  }

  // 1. Загружаем, какие атрибуты нужны для этой категории
  categoryAttributes.value = await productStore.getAttributesForCategory(categoryId)

  // 2. Инициализируем `productAttributeValues` пустыми значениями
  const newValues: Record<number, number | null> = {}
  for (const attr of categoryAttributes.value) {
    newValues[attr.id] = null
  }

  // 3. Если это режим редактирования, загружаем и подставляем сохраненные значения
  if (props.initialData?.id) {
    const savedValues = await productStore.getProductAttributeValues(props.initialData.id)
    for (const savedValue of savedValues) {
      if (savedValue.attribute_id in newValues) {
        newValues[savedValue.attribute_id] = savedValue.option_id
      }
    }
  }
  productAttributeValues.value = newValues
}

// Отслеживаем изменение category_id в нашей основной форме
watch(() => formData.value.category_id, (newCategoryId) => {
  handleCategoryChange(newCategoryId)
}, { immediate: true })

onMounted(() => {
  if (categoriesStore.allCategories.length === 0)
    categoriesStore.fetchAllCategories()
  if (productStore.brands.length === 0)
    productStore.fetchAllBrands()
  if (productStore.countries.length === 0)
    productStore.fetchAllCountries()
  if (productStore.materials.length === 0)
    productStore.fetchAllMaterials()
})

// --- 5. РЕАКТИВНОСТЬ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
watch([() => formData.value.price, selectedBonusPercent], ([price, percent]) => {
  if (formData.value && typeof price === 'number' && typeof percent === 'number')
    formData.value.bonus_points_award = Math.round(price * (percent / 100))
})

function autoFillSlug() {
  if (formData.value?.name && !formData.value.slug)
    formData.value.slug = slugify(formData.value.name)
}

// --- 6. УПРАВЛЕНИЕ ИЗОБРАЖЕНИЯМИ ---
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

// --- 8. ОТПРАВКА ФОРМЫ ---
function handleSubmit() {
  if (!formData.value)
    return
  if (!formData.value.name || !formData.value.slug) {
    toast.error('Название и Слаг - обязательные поля')
    return
  }

  formData.value.accessory_ids = linkedAccessories.value.map(p => p.id)
  formData.value.sku = formData.value.sku || null

  const productData = { ...formData.value }

  const valuesToSave = Object.entries(productAttributeValues.value).map(([attrId, optId]) => ({
    attribute_id: Number(attrId),
    option_id: optId,
  }))

  if (props.initialData) {
    emit('update', {
      data: productData as ProductUpdate,
      newImageFiles: newImageFiles.value.map(item => item.file),
      imagesToDelete: imagesToDelete.value,
      existingImages: existingImages.value,
      attributeValues: valuesToSave,
    })
  }
  else {
    emit('create', {
      data: productData as ProductInsert,
      newImageFiles: newImageFiles.value.map(item => item.file),
      attributeValues: valuesToSave,
    })
  }
}

const skuValue = computed({
  // GET: Когда компонент читает значение
  get() {
    // Если в данных null, отдаем компоненту undefined (или пустую строку), что он понимает
    return formData.value.sku ?? undefined
  },
  // SET: Когда компонент записывает новое значение (пользователь печатает)
  set(value) {
    if (formData.value) {
      // Если пришла пустая строка, в наши данные записываем null. Иначе - само значение.
      formData.value.sku = value || null
    }
  },
})

const barcodeValue = computed({
  get() {
    return formData.value.barcode ?? undefined
  },
  set(value) {
    if (formData.value) {
      formData.value.barcode = value || null
    }
  },
})

const descriptionValue = computed({
  // GET: Когда компонент читает значение
  get() {
    // Если в данных null, отдаем компоненту undefined (или пустую строку), что он понимает
    return formData.value.description ?? undefined
  },
  // SET: Когда компонент записывает новое значение (пользователь печатает)
  set(value) {
    if (formData.value) {
      // Если пришла пустая строка, в наши данные записываем null. Иначе - само значение.
      formData.value.description = value || null
    }
  },
})

const minAgeYearsValue = computed({
  get() {
    // Отдаем компоненту `undefined`, если в данных `null`
    return formData.value.min_age_years ?? undefined
  },
  set(value) {
    if (formData.value) {
      // Если из инпута приходит не число (например, его очистили),
      // записываем в наши данные `null`
      formData.value.min_age_years = typeof value === 'number' ? value : null
    }
  },
})

const maxAgeYearsValue = computed({
  get() {
    return formData.value.max_age_years ?? undefined
  },
  set(value) {
    if (formData.value) {
      formData.value.max_age_years = typeof value === 'number' ? value : null
    }
  },
})
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
            <Label for="sku">Артикул (SKU)</Label>
            <Input id="sku" v-model="skuValue" placeholder="Уникальный код товара" />
          </div>
          <div>
            <Label for="barcode">Штрихкод (Barcode)</Label>
            <Input id="barcode" v-model="barcodeValue" placeholder="Например, 4601234567890" />
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
          <CardTitle>Цена, бонусы и скидка</CardTitle>
        </CardHeader>
        <CardContent class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label for="price">Цена в ₸ *</Label>
            <Input id="price" v-model.number="formData.price" type="number" />
          </div>
          <div>
            <Label for="discount_percentage">Скидка (%)</Label>
            <Input
              id="discount_percentage"
              v-model.number="formData.discount_percentage"
              type="number"
              min="0"
              max="100"
              placeholder="0-100"
            />
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
              Будет начислено: <span class="font-bold text-primary">{{ formData.bonus_points_award || 0 }} бонусов</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card v-if="categoryAttributes.length > 0">
        <CardHeader>
          <CardTitle>Характеристики</CardTitle>
          <CardDescription>
            Заполните значения для фильтров, привязанных к выбранной категории.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-for="attribute in categoryAttributes" :key="attribute.id">
            <Label>{{ attribute.name }}</Label>
            <!-- Отображаем Select для атрибутов типа 'select' или 'color' -->
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
            <!-- Здесь можно будет добавить другие типы, например Input для 'range' -->
          </div>
        </CardContent>
      </Card>

      <!-- Сопутствующие товары (Аксессуары) -->
      <Card>
        <CardHeader>
          <CardTitle>Сопутствующие товары</CardTitle>
          <CardDescription>Привяжите аксессуары, например, батарейки или подарочную упаковку.</CardDescription>
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
          <CardTitle>Организация и фильтры</CardTitle>
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
            <Label>Бренд (опционально)</Label>
            <Popover>
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  role="combobox"
                  class="w-full justify-between font-normal"
                >
                  <span v-if="formData.brand_id">
                    {{ brands.find(b => b.id === formData.brand_id)?.name }}
                  </span>
                  <span v-else class="text-muted-foreground">
                    Выберите бренд...
                  </span>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[--radix-popover-trigger-width] p-0">
                <Command v-model:model-value="brandSearchQuery">
                  <CommandInput placeholder="Поиск или создание бренда..." />
                  <CommandList>
                    <CommandEmpty>
                      <!-- Этот блок показывается, когда поиск ничего не нашел -->
                      <div
                        class="relative cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent"
                        @click="() => { isBrandDialogOpen = true }"
                      >
                        <Plus class="inline-block mr-2 h-4 w-4" />
                        Создать новый бренд
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      <!-- Опция для сброса значения -->
                      <CommandItem
                        value=""
                        @select="() => { formData.brand_id = null }"
                      >
                        <Check :class="!formData.brand_id ? 'opacity-100' : 'opacity-0'" class="mr-2 h-4 w-4" />
                        Без бренда
                      </CommandItem>
                      <!-- Список существующих брендов -->
                      <CommandItem
                        v-for="brand in filteredBrands"
                        :key="brand.id"
                        :value="brand.name"
                        @select="() => { formData.brand_id = brand.id }"
                      >
                        <Check :class="formData.brand_id === brand.id ? 'opacity-100' : 'opacity-0'" class="mr-2 h-4 w-4" />
                        {{ brand.name }}
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <!-- Модальное окно для создания бренда (остается без изменений) -->
            <Dialog v-model:open="isBrandDialogOpen">
              <DialogContent class="sm:max-w-[625px]">
                <DialogHeader>
                  <DialogTitle>Создать новый бренд</DialogTitle>
                </DialogHeader>
                <BrandForm :initial-name="brandSearchQuery" @submit="handleBrandCreate" />
              </DialogContent>
            </Dialog>
          </div>

          <div>
            <Label>Страна происхождения (опционально)</Label>
            <Select v-model="formData.origin_country_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите страну" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не указана
                </SelectItem>
                <SelectItem v-for="country in countries" :key="country.id" :value="country.id">
                  {{ country.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Материал (опционально)</Label>
            <Select v-model="formData.material_id">
              <SelectTrigger>
                <SelectValue placeholder="Выберите материал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem :value="null">
                  Не указан
                </SelectItem>
                <SelectItem v-for="material in materials" :key="material.id" :value="material.id">
                  {{ material.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label for="stock">Количество на складе</Label>
            <Input id="stock" v-model.number="formData.stock_quantity" type="number" />
          </div>

          <div class="flex items-center space-x-2 pt-2">
            <Switch id="is_active" v-model:model-value="formData.is_active" />
            <Label for="is_active">Активен для продажи</Label>
          </div>

          <div class="pt-2">
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

          <div class="grid grid-cols-2 gap-4 pt-2">
            <div>
              <Label for="min_age_years">Мин. возраст (лет)</Label>
              <Input id="min_age_years" v-model.number="minAgeYearsValue" type="number" />
            </div>
            <div>
              <Label for="max_age_years">Макс. возраст (лет)</Label>
              <Input id="max_age_years" v-model.number="maxAgeYearsValue" type="number" />
            </div>
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
