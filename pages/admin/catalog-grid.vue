<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'

definePageMeta({ layout: 'admin' })

const adminCategoriesStore = useAdminCategoriesStore()
const isSaving = ref(false)

// Загружаем категории
const { pending: isLoading } = useAsyncData(
  'admin-catalog-grid-categories',
  () => adminCategoriesStore.fetchAllCategories(),
)

// Получаем только подкатегории второго уровня (те что отображаются в каталоге)
const secondLevelCategories = computed(() => {
  return adminCategoriesStore.allCategories.filter((cat) => {
    if (!cat.parent_id)
      return false
    const parent = adminCategoriesStore.allCategories.find(c => c.id === cat.parent_id)
    return parent?.is_root_category === true
  }).sort((a, b) => a.display_order - b.display_order)
})

// Группируем по размерам
const categoriesBySize = computed(() => {
  const small: CategoryRow[] = []
  const medium: CategoryRow[] = []
  const large: CategoryRow[] = []

  secondLevelCategories.value.forEach((cat) => {
    const order = cat.featured_order ?? 0
    if (order >= 67) {
      large.push(cat)
    }
    else if (order >= 34) {
      medium.push(cat)
    }
    else {
      small.push(cat)
    }
  })

  return { small, medium, large }
})

const originalFeaturedOrders = ref<Map<string, number>>(new Map())

// После загрузки категорий сохраняем оригинальные значения
watch(() => adminCategoriesStore.allCategories, (categories) => {
  if (categories.length > 0 && originalFeaturedOrders.value.size === 0) {
    categories.forEach((cat) => {
      originalFeaturedOrders.value.set(cat.id, cat.featured_order ?? 0)
    })
  }
}, { immediate: true })

// Проверяем есть ли изменения
const hasChanges = computed(() => {
  return adminCategoriesStore.allCategories.some((cat) => {
    const original = originalFeaturedOrders.value.get(cat.id)
    return original !== (cat.featured_order ?? 0)
  })
})

// Выбранные категории
const selectedCategories = ref<string[]>([])

// Переключение выбора
function toggleSelection(id: string) {
  const index = selectedCategories.value.indexOf(id)
  if (index > -1) {
    selectedCategories.value.splice(index, 1)
  }
  else {
    selectedCategories.value.push(id)
  }
}

// Установка размера для выбранных категорий
function setSize(size: 'small' | 'medium' | 'large') {
  if (selectedCategories.value.length === 0) {
    toast.error('Выберите категории для изменения размера')
    return
  }

  let newOrder: number
  switch (size) {
    case 'large':
      newOrder = 80
      break
    case 'medium':
      newOrder = 50
      break
    case 'small':
    default:
      newOrder = 10
      break
  }

  // Обновляем featured_order для выбранных категорий
  adminCategoriesStore.allCategories.forEach((cat, index) => {
    if (selectedCategories.value.includes(cat.id)) {
      adminCategoriesStore.allCategories[index] = {
        ...cat,
        featured_order: newOrder,
      }
    }
  })

  selectedCategories.value = []
  toast.success(`Размер установлен для категорий`)
}

// Сброс изменений
function resetChanges() {
  adminCategoriesStore.allCategories.forEach((cat, index) => {
    const original = originalFeaturedOrders.value.get(cat.id)
    if (original !== undefined) {
      adminCategoriesStore.allCategories[index] = {
        ...cat,
        featured_order: original,
      }
    }
  })
  selectedCategories.value = []
  toast.info('Изменения сброшены')
}

// Сохранение изменений
async function saveChanges() {
  isSaving.value = true

  try {
    const supabase = useSupabaseClient()

    // Обновляем только измененные категории
    const changedCategories = adminCategoriesStore.allCategories.filter((cat) => {
      const original = originalFeaturedOrders.value.get(cat.id)
      return original !== (cat.featured_order ?? 0)
    })

    if (changedCategories.length === 0) {
      toast.info('Нет изменений для сохранения')
      isSaving.value = false
      return
    }

    const updatePromises = changedCategories.map(cat =>
      supabase
        .from('categories')
        .update({ featured_order: cat.featured_order ?? 0 })
        .eq('id', cat.id),
    )

    const results = await Promise.all(updatePromises)

    const errors = results.filter(r => r.error)
    if (errors.length > 0) {
      throw new Error(`Ошибка обновления ${errors.length} категорий`)
    }

    toast.success(`Обновлено категорий: ${changedCategories.length}`)

    // Обновляем оригинальные значения
    await adminCategoriesStore.fetchAllCategories(true)
    originalFeaturedOrders.value.clear()
    adminCategoriesStore.allCategories.forEach((cat) => {
      originalFeaturedOrders.value.set(cat.id, cat.featured_order ?? 0)
    })
  }
  catch (e: any) {
    toast.error('Ошибка сохранения', { description: e.message })
  }
  finally {
    isSaving.value = false
  }
}

// Получаем размер категории
function getCategorySize(category: CategoryRow): 'small' | 'medium' | 'large' {
  const order = category.featured_order ?? 0
  if (order >= 67)
    return 'large'
  if (order >= 34)
    return 'medium'
  return 'small'
}

// Цвета для бейджей
const sizeColors = {
  small: 'default',
  medium: 'secondary',
  large: 'destructive',
} as const

const sizeLabels = {
  small: 'Обычная',
  medium: 'Средняя',
  large: 'Большая',
}

// Активная вкладка
const activeTab = ref('preview')
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <!-- Шапка -->
    <div class="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold text-foreground">
          Управление сеткой каталога
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Настройте размеры карточек категорий на странице каталога
        </p>
      </div>
      <div class="flex gap-2">
        <Button
          v-if="hasChanges"
          variant="outline"
          @click="resetChanges"
        >
          <Icon name="lucide:undo-2" class="w-4 h-4 mr-2" />
          Сбросить
        </Button>
        <Button
          :disabled="isSaving || !hasChanges"
          @click="saveChanges"
        >
          <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:save" class="w-4 h-4 mr-2" />
          Сохранить изменения
        </Button>
      </div>
    </div>

    <!-- Панель управления -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle class="text-base">
          Быстрые действия
          <span v-if="selectedCategories.length > 0" class="text-sm font-normal text-muted-foreground ml-2">
            (выбрано: {{ selectedCategories.length }})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            :disabled="selectedCategories.length === 0"
            @click="setSize('small')"
          >
            <Icon name="lucide:square" class="w-4 h-4 mr-2" />
            Установить "Обычная"
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="selectedCategories.length === 0"
            @click="setSize('medium')"
          >
            <Icon name="lucide:square-stack" class="w-4 h-4 mr-2" />
            Установить "Средняя"
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="selectedCategories.length === 0"
            @click="setSize('large')"
          >
            <Icon name="lucide:maximize-2" class="w-4 h-4 mr-2" />
            Установить "Большая"
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Загрузка -->
    <div v-if="isLoading" class="text-center py-20">
      <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
      <p class="text-muted-foreground">
        Загрузка категорий...
      </p>
    </div>

    <!-- Табы: Предпросмотр / Управление списком -->
    <Tabs v-else v-model="activeTab" class="w-full">
      <TabsList class="grid w-full max-w-md grid-cols-2 mb-6">
        <TabsTrigger value="preview">
          <Icon name="lucide:layout-grid" class="w-4 h-4 mr-2" />
          Предпросмотр сетки
        </TabsTrigger>
        <TabsTrigger value="manage">
          <Icon name="lucide:list" class="w-4 h-4 mr-2" />
          Управление списком
        </TabsTrigger>
      </TabsList>

      <!-- Вкладка: Предпросмотр сетки -->
      <TabsContent value="preview" class="mt-0">
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Icon name="lucide:eye" class="w-5 h-5" />
              Предпросмотр сетки каталога
            </CardTitle>
            <p class="text-sm text-muted-foreground">
              Так будут выглядеть категории на странице каталога
            </p>
          </CardHeader>
          <CardContent>
            <!-- Симуляция настоящей сетки каталога -->
            <div class="grid grid-cols-2 gap-3 md:gap-4 auto-rows-min">
              <div
                v-for="category in secondLevelCategories"
                :key="category.id"
                class="relative overflow-hidden rounded-lg border-2 transition-all cursor-pointer group"
                :class="[
                  selectedCategories.includes(category.id)
                    ? 'border-primary shadow-lg ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50',
                  getCategorySize(category) === 'large'
                    ? 'h-[280px] md:h-[320px]'
                    : getCategorySize(category) === 'medium'
                      ? 'h-[220px] md:h-[260px]'
                      : 'h-[160px] md:h-[180px]',
                ]"
                @click="toggleSelection(category.id)"
              >
                <!-- Изображение категории -->
                <div class="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted">
                  <NuxtImg
                    v-if="category.image_url"
                    :src="category.image_url"
                    :alt="category.name"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-muted-foreground"
                  >
                    <Icon name="lucide:image-off" class="w-12 h-12" />
                  </div>
                </div>

                <!-- Оверлей с градиентом -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                <!-- Контент -->
                <div class="absolute inset-0 p-4 flex flex-col justify-end">
                  <div class="space-y-2">
                    <!-- Бейдж размера -->
                    <Badge
                      :variant="sizeColors[getCategorySize(category)]"
                      class="w-fit"
                    >
                      {{ sizeLabels[getCategorySize(category)] }}
                    </Badge>

                    <!-- Название -->
                    <h3
                      class="font-bold text-white transition-all"
                      :class="getCategorySize(category) === 'large' ? 'text-xl md:text-2xl' : 'text-base md:text-lg'"
                    >
                      {{ category.name }}
                    </h3>

                    <!-- Описание (для средних и больших) -->
                    <p
                      v-if="category.description && getCategorySize(category) !== 'small'"
                      class="text-xs md:text-sm text-white/80 line-clamp-2"
                    >
                      {{ category.description }}
                    </p>
                  </div>
                </div>

                <!-- Индикатор выбора -->
                <div
                  v-if="selectedCategories.includes(category.id)"
                  class="absolute top-2 right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg"
                >
                  <Icon name="lucide:check" class="w-5 h-5 text-primary-foreground" />
                </div>

                <!-- Hover эффект -->
                <div class="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            <!-- Пустое состояние -->
            <div
              v-if="secondLevelCategories.length === 0"
              class="text-center py-20 text-muted-foreground"
            >
              <Icon name="lucide:folder-x" class="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p class="text-lg font-medium">
                Категории не найдены
              </p>
              <p class="text-sm">
                Добавьте категории второго уровня для отображения в каталоге
              </p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <!-- Вкладка: Управление списком -->
      <TabsContent value="manage" class="mt-0">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Обычные -->
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center justify-between">
                <span>Обычные</span>
                <Badge variant="default">
                  {{ categoriesBySize.small.length }}
                </Badge>
              </CardTitle>
              <p class="text-xs text-muted-foreground">
                Компактная карточка (160-180px)
              </p>
            </CardHeader>
            <CardContent class="h-96 overflow-y-auto space-y-1">
              <div
                v-for="item in categoriesBySize.small"
                :key="item.id"
                class="p-3 rounded-md cursor-pointer border transition-all"
                :class="
                  selectedCategories.includes(item.id)
                    ? 'bg-primary/20 border-primary'
                    : 'hover:bg-muted/50'
                "
                @click="toggleSelection(item.id)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">
                      {{ item.name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      order: {{ item.display_order }}
                    </div>
                  </div>
                  <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0">
                    {{ sizeLabels[getCategorySize(item)] }}
                  </Badge>
                </div>
              </div>
              <div v-if="categoriesBySize.small.length === 0" class="text-center py-8 text-muted-foreground text-sm">
                Нет категорий
              </div>
            </CardContent>
          </Card>

          <!-- Средние -->
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center justify-between">
                <span>Средние</span>
                <Badge variant="secondary">
                  {{ categoriesBySize.medium.length }}
                </Badge>
              </CardTitle>
              <p class="text-xs text-muted-foreground">
                Средняя карточка (220-260px)
              </p>
            </CardHeader>
            <CardContent class="h-96 overflow-y-auto space-y-1">
              <div
                v-for="item in categoriesBySize.medium"
                :key="item.id"
                class="p-3 rounded-md cursor-pointer border transition-all"
                :class="
                  selectedCategories.includes(item.id)
                    ? 'bg-primary/20 border-primary'
                    : 'hover:bg-muted/50'
                "
                @click="toggleSelection(item.id)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">
                      {{ item.name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      order: {{ item.display_order }}
                    </div>
                  </div>
                  <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0">
                    {{ sizeLabels[getCategorySize(item)] }}
                  </Badge>
                </div>
              </div>
              <div v-if="categoriesBySize.medium.length === 0" class="text-center py-8 text-muted-foreground text-sm">
                Нет категорий
              </div>
            </CardContent>
          </Card>

          <!-- Большие -->
          <Card>
            <CardHeader>
              <CardTitle class="flex items-center justify-between">
                <span>Большие (акцентные)</span>
                <Badge variant="destructive">
                  {{ categoriesBySize.large.length }}
                </Badge>
              </CardTitle>
              <p class="text-xs text-muted-foreground">
                Высокая карточка (280-320px)
              </p>
            </CardHeader>
            <CardContent class="h-96 overflow-y-auto space-y-1">
              <div
                v-for="item in categoriesBySize.large"
                :key="item.id"
                class="p-3 rounded-md cursor-pointer border transition-all"
                :class="
                  selectedCategories.includes(item.id)
                    ? 'bg-primary/20 border-primary'
                    : 'hover:bg-muted/50'
                "
                @click="toggleSelection(item.id)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm truncate">
                      {{ item.name }}
                    </div>
                    <div class="text-xs text-muted-foreground mt-0.5">
                      order: {{ item.display_order }}
                    </div>
                  </div>
                  <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0">
                    {{ sizeLabels[getCategorySize(item)] }}
                  </Badge>
                </div>
              </div>
              <div v-if="categoriesBySize.large.length === 0" class="text-center py-8 text-muted-foreground text-sm">
                Нет категорий
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    <!-- Информационная панель -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="text-base">
          <Icon name="lucide:info" class="w-4 h-4 inline mr-2" />
          Как это работает
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-2 text-sm text-muted-foreground">
        <p>
          • <strong>Компактная карточка:</strong> Низкая высота (160-180px), все помещается в 2 колонки
        </p>
        <p>
          • <strong>Средняя карточка:</strong> Средняя высота (220-260px), больше места для изображения
        </p>
        <p>
          • <strong>Высокая карточка:</strong> Большая высота (280-320px), акцентный элемент с описанием
        </p>
        <p class="text-xs pt-2 border-t">
          💡 Совет: Все карточки занимают 1 колонку из 2, но различаются по высоте для создания динамичной сетки
        </p>
      </CardContent>
    </Card>
  </div>
</template>
