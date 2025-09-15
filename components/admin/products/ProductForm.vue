<script setup lang="ts">
import type { FullProduct, ProductImageRow, ProductInsert, ProductUpdate } from '@/types'
import { computed, onMounted, ref, watch } from 'vue'

import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'
import { slugify } from '@/utils/slugify'

// --- 1. PROPS & EMITS ---
const props = defineProps<{
  initialData?: FullProduct | null
}>()

const emit = defineEmits<{
  (e: 'create', payload: {
    data: ProductInsert
    newImageFiles: File[]
  }): void

  (e: 'update', payload: {
    data: ProductUpdate
    newImageFiles: File[]
    imagesToDelete: string[]
    existingImages: ProductImageRow[]
  }): void
}>()

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ КОМПОНЕНТА ---
const formData = ref<any>({})
const newImageFiles = ref<{ file: File, previewUrl: string }[]>([])
const existingImages = ref<ProductImageRow[]>([])
const imagesToDelete = ref<string[]>([])
const selectedBonusPercent = ref(5)

const categoriesStore = useAdminCategoriesStore()
const { getPublicUrl } = useSupabaseStorage()

const bonusOptions = [
  { label: 'Стандарт (5%)', value: 5 },
  { label: 'Повышенный (20%)', value: 20 },
  { label: 'Акция (80%)', value: 80 },
  { label: 'Подарок (100%)', value: 100 },
]

// --- 3. ИНИЦИАЛИЗАЦИЯ ФОРМЫ ---
watch(() => props.initialData, (product) => {
  newImageFiles.value = []
  imagesToDelete.value = []

  if (product) {
    formData.value = JSON.parse(JSON.stringify(product))
    existingImages.value = [...(product.product_images || [])]
    if (product.price > 0) {
      const percent = Math.round((product.bonus_points_award / Number(product.price)) * 100)
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
      description: '',
      price: 0,
      category_id: null,
      stock_quantity: 0,
      is_active: true,
      bonus_points_award: 0,
      min_age: null,
      max_age: null,
      gender: 'unisex',
    }
    existingImages.value = []
    selectedBonusPercent.value = 5
  }
}, { immediate: true })

onMounted(() => {
  categoriesStore.fetchAllCategories()
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

// --- 5. ФУНКЦИЯ ОТПРАВКИ ---
function handleSubmit() {
  const { categories, product_images, ...productData } = formData.value

  if (props.initialData) {
    emit('update', {
      data: productData,
      newImageFiles: newImageFiles.value.map(item => item.file),
      imagesToDelete: imagesToDelete.value,
      existingImages: existingImages.value,
    })
  }
  else {
    if (!productData.name || !productData.slug) {
      toast.error('Название и Слаг - обязательные поля')
      return
    }
    emit('create', {
      data: productData,
      newImageFiles: newImageFiles.value.map(item => item.file),
    })
  }
}
</script>

<template>
  <form v-if="formData" class="grid grid-cols-1 lg:grid-cols-3 gap-8" @submit.prevent="handleSubmit">
    <!-- Левая колонка -->
    <div class="lg:col-span-2 space-y-6">
      <Card>
        <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
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
            <Textarea id="description" v-model="formData.description" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Цена и бонусы</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="price">Цена в ₸ *</Label>
            <Input id="price" v-model.number="formData.price" type="number" />
          </div>
          <div class="p-3 bg-muted/50 rounded-md">
            <Label>Процент бонусов</Label>
            <Select v-model.number="selectedBonusPercent">
              <SelectTrigger><SelectValue /></SelectTrigger>
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

      <Card>
        <CardHeader>
          <CardTitle>Параметры для рекомендаций</CardTitle>
          <CardDescription>Помогут рекомендовать товар нужным пользователям.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label for="min_age">Мин. возраст (в месяцах)</Label>
              <Input id="min_age" v-model.number="minAgeValue" type="number" placeholder="Например, 36" />
            </div>
            <div>
              <Label for="max_age">Макс. возраст (в месяцах)</Label>
              <Input id="max_age" v-model.number="maxAgeValue" type="number" placeholder="Например, 72" />
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
    </div>

    <!-- Правая колонка -->
    <div class="lg:col-span-1 space-y-6">
      <Card>
        <CardHeader><CardTitle>Организация</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label>Категория</Label>
            <Select v-model="formData.category_id">
              <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
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
            <Switch id="is_active" v-model:checked="formData.is_active" />
            <Label for="is_active">Активен</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Галерея изображений</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div v-if="existingImages.length > 0" class="space-y-2">
            <p class="text-sm font-medium">
              Текущие изображения
            </p>
            <div v-for="image in existingImages" :key="image.id" class="relative group">
              <NuxtImg :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || ''" class="w-full h-24 object-cover rounded-md" />
              <Button type="button" variant="destructive" size="icon" class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" @click="removeExistingImage(image)">
                X
              </Button>
            </div>
          </div>
          <div v-if="newImageFiles.length > 0" class="space-y-2">
            <p class="text-sm font-medium">
              Новые на загрузку
            </p>
            <div v-for="(item, index) in newImageFiles" :key="index" class="relative group">
              <img :src="item.previewUrl" class="w-full h-24 object-cover rounded-md" alt="Превью нового изображения">
              <Button type="button" variant="destructive" size="icon" class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" @click="removeNewImage(index)">
                X
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
