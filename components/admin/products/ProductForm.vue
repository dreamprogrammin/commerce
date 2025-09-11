<script setup lang="ts">
import type { FullProduct, ProductImageRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'
import { slugify } from '@/utils/slugify'

const props = defineProps<{
  product?: FullProduct | null // Принимаем product, может быть null при загрузке
}>()
const emit = defineEmits(['submit'])

const newImagesFiles = ref<{ file: File, previewUrl: string }[]>([])
const existingImages = ref<ProductImageRow[]>([])
const imagesToDelete = ref<string[]>([])

const { getPublicUrl } = useSupabaseStorage()

const form = ref({
  name: '',
  slug: '',
  description: '',
  price: 0,
  category_id: null as string | null,
  stock_quantity: 0,
  is_active: true,
  bonus_points_award: 0,
  min_age: null as number | null,
  max_age: null as number | null,
  gender: 'unisex' as 'male' | 'female' | 'unisex',
})
const imageFile = ref<File | null>(null)

// Синхронизируем форму с пропсами, когда они приходят
watch(() => props.product, (newProduct) => {
  if (newProduct) {
    form.value.name = newProduct.name
    form.value.slug = newProduct.slug
    form.value.description = newProduct.description || ''
    form.value.price = Number(newProduct.price) || 0
    form.value.category_id = newProduct.category_id
    form.value.stock_quantity = newProduct.stock_quantity
    form.value.is_active = newProduct.is_active
    form.value.bonus_points_award = newProduct.bonus_points_award
    form.value.min_age = newProduct.min_age
    form.value.max_age = newProduct.max_age
    const genderFormDb = newProduct.gender

    if (genderFormDb === 'male' || genderFormDb === 'female' || genderFormDb === 'unisex') {
      form.value.gender = genderFormDb
    }
    else {
      form.value.gender = 'unisex'
    }

    if (newProduct) {
      existingImages.value = [...(newProduct.product_images || [])]
    }
  }
}, { immediate: true })

// === ЛОГИКА БОНУСОВ ===
const bonusOptions = [
  { label: 'Стандарт (5%)', value: 5 },
  { label: 'Повышенный (20%)', value: 20 },
  { label: 'Акция (80%)', value: 80 },
  { label: 'Подарок (100%)', value: 100 },
]
const selectedBonusPercent = ref(5) // Значение по умолчанию

watch([() => form.value.price, selectedBonusPercent], ([price, percent]) => {
  if (price && percent) {
    form.value.bonus_points_award = Math.round(Number(price) * (percent / 100))
  }
  else {
    form.value.bonus_points_award = 0
  }
}, { immediate: true })

// Инициализация selectedBonusPercent при редактировании
watch(() => props.product, (newProduct) => {
  if (newProduct && newProduct.price > 0) {
    const percent = Math.round((newProduct.bonus_points_award / Number(newProduct.price)) * 100)
    const existingOption = bonusOptions.find(opt => opt.value === percent)
    selectedBonusPercent.value = existingOption ? percent : 5
  }
}, { immediate: true })
// ======================

const minAgeValue = computed({
  get() {
    return form.value.min_age === null ? undefined : form.value.min_age
  },
  set(value) {
    form.value.min_age = (typeof value === 'number') ? value : null
  },
})

const maxAgeValue = computed({
  get() {
    return form.value.max_age === null ? undefined : form.value.max_age
  },
  set(value) {
    form.value.max_age = (typeof value === 'number') ? value : null
  },
})

const categoriesStore = useAdminCategoriesStore()
onMounted(() => {
  categoriesStore.fetchAllCategories()
})

function autoFillSlug() {
  if (form.value.name) {
    form.value.slug = slugify(form.value.name)
  }
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files) {
    const filesWithPreview = Array.from(target.files).map(file => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }))

    newImagesFiles.value.push(...filesWithPreview)
    target.value = ''
  }
}

function removeNewImage(index: number) {
  const fileToRemove = newImagesFiles.value[index]
  if (fileToRemove) {
    URL.revokeObjectURL(fileToRemove.previewUrl)
  }
  newImagesFiles.value.splice(index, 1)
}

function removeExistingImage(image: ProductImageRow) {
  imagesToDelete.value.push(image.id)
  existingImages.value = existingImages.value.filter(img => img.id !== image.id)
}
</script>

<template>
  <form class="grid grid-cols-1 lg:grid-cols-3 gap-8" @submit.prevent="emit('submit', form, imageFile)">
    <div class="lg:col-span-2 space-y-6">
      <Card>
        <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="name">Название товара</Label>
            <Input id="name" v-model="form.name" @blur="autoFillSlug" />
          </div>
          <div>
            <Label for="slug">Слаг (URL)</Label>
            <Input id="slug" v-model="form.slug" />
          </div>
          <div>
            <Label for="description">Описание</Label>
            <Textarea id="description" v-model="form.description" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Цена и бонусы</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="price">Цена в ₸</Label>
            <Input id="price" v-model.number="form.price" type="number" />
          </div>
          <div class="p-3 bg-muted/50 rounded-md">
            <Label>Процент бонусов</Label>
            <Select v-model.number="selectedBonusPercent">
              <SelectTrigger><SelectValue placeholder="Выберите процент..." /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in bonusOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p class="text-sm text-muted-foreground mt-2">
              Будет начислено: <span class="font-bold text-primary">{{ form.bonus_points_award }} бонусов</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>

    <div class="lg:col-span-1 space-y-6">
      <Card>
        <CardHeader><CardTitle>Организация</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label>Категория</Label>
            <Select v-model="form.category_id!">
              <SelectTrigger><SelectValue placeholder="Выберите категорию" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem v-for="cat in categoriesStore.allCategories" :key="cat.id" :value="cat.id">
                    {{ cat.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label for="stock">Количество на складе</Label>
            <Input id="stock" v-model.number="form.stock_quantity" type="number" />
          </div>
          <div class="flex items-center space-x-2 pt-2">
            <Switch id="is_active" v-model:model-value="form.is_active" />
            <Label for="is_active">Активен</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Параметры рекомендаций</CardTitle>
          <CardDescription>
            Эти поля помогут нам рекомендовать товар нужным пользователям.
            Оставьте пустыми, если товар универсальный.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label for="min_age">Мин. возраст (в месяцах)</Label>
              <Input id="min_age" v-model.number="minAgeValue" type="number" placeholder="Например, 36 (3 года)" />
            </div>

            <div>
              <Label for="min_age">Макс. возраст (в месяцах)</Label>
              <Input id="min_age" v-model.number="maxAgeValue" type="number" placeholder="Например, 72 (6 лет)" />
            </div>
          </div>

          <div>
            <Label for="gender">Пол</Label>
            <Select v-model="form.gender">
              <SelectTrigger id="gender">
                <SelectValue placeholder="Выберите пол..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unisex">
                  Унисекс (для всех)
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

        <Card>
          <CardHeader><CardTitle>Галерея изображений</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div v-if="existingImages.length > 0" class="space-y-2">
              <p class="text-sm font-medium">
                Текущие изображения
              </p>
              <div v-for="image in existingImages" :key="image.id" class="relative group">
                <NuxtImg
                  :src="getPublicUrl(BUCKET_NAME_PRODUCT, image.image_url) || undefined"
                  class="w-full h-24 object-cover rounded-md"
                  format="webp"
                  quality="85"
                  placeholder
                />
                <Button
                  variant="destructive"
                  size="icon"
                  class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                  @click="removeExistingImage(image)"
                >
                  X
                </Button>
              </div>
            </div>

            <div v-if="newImagesFiles.length > 0" class="space-y-2">
              <p class="text-sm font-medium">
                Новые на загрузку
              </p>
              <div v-for="(item, index) in newImagesFiles" :key="item.file.name + index" class="relative group">
                <img :src="item.previewUrl" class="w-full object-cover rounded-md" alt="добавление картинки">
                <Button variant="destructive" size="icon" class="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" @click="removeNewImage(index)">
                  X
                </Button>
              </div>
            </div>

            <div>
              <Label for="images">Добавить фото</Label>
              <Input id="images" type="file" multiple accept="image/*" @change="handleFileChange" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" class="w-full">
          Сохранить товар
        </Button>
      </card>
    </div>
  </form>
</template>
