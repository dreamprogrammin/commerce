<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'

definePageMeta({ layout: 'admin' })

const { getImageUrl } = useSupabaseStorage()

const adminCategoriesStore = useAdminCategoriesStore()
const isSaving = ref(false)

// Статичные дополнительные пункты для предпросмотра
const additionalItems = [
  {
    id: 'new',
    name: 'Новинки',
    href: '/catalog/all?sort_by=newest',
    icon: 'lucide:sparkles',
    display_order: 1,
  },
  {
    id: 'sale',
    name: 'Акции',
    href: '/catalog/sale',
    icon: 'lucide:percent',
    display_order: 2,
  },
]

// Загружаем категории
const { pending: isLoading } = useAsyncData(
  'admin-catalog-grid-categories',
  async () => {
    await adminCategoriesStore.fetchAllCategories()
    return true // Возвращаем значение
  },
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
  <ClientOnly>
    <div class="min-h-screen bg-background">
      <div class="container mx-auto p-4 md:p-8 max-w-7xl">
        <!-- Шапка с улучшенным дизайном -->
        <div class="mb-8">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Icon name="lucide:layout-grid" class="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 class="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                    Сетка каталога
                  </h1>
                  <p class="text-sm text-muted-foreground mt-1">
                    Управление размерами и расположением категорий
                  </p>
                </div>
              </div>
            </div>
            <div class="flex gap-2 w-full md:w-auto">
              <Button
                v-if="hasChanges"
                variant="outline"
                class="flex-1 md:flex-none"
                @click="resetChanges"
              >
                <Icon name="lucide:undo-2" class="w-4 h-4 mr-2" />
                Сбросить
              </Button>
              <Button
                :disabled="isSaving || !hasChanges"
                class="flex-1 md:flex-none"
                @click="saveChanges"
              >
                <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
                <Icon v-else name="lucide:save" class="w-4 h-4 mr-2" />
                Сохранить
              </Button>
            </div>
          </div>
        </div>

        <!-- Панель управления с улучшенным стилем -->
        <Card class="mb-6 border-2 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader class="pb-3">
            <div class="flex items-center gap-2">
              <Icon name="lucide:wand-2" class="w-5 h-5 text-primary" />
              <CardTitle class="text-lg">
                Быстрые действия
              </CardTitle>
              <Badge v-if="selectedCategories.length > 0" variant="secondary" class="ml-auto">
                Выбрано: {{ selectedCategories.length }}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                :disabled="selectedCategories.length === 0"
                class="transition-all hover:scale-105"
                @click="setSize('small')"
              >
                <Icon name="lucide:square" class="w-4 h-4 mr-2" />
                Обычная
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="selectedCategories.length === 0"
                class="transition-all hover:scale-105"
                @click="setSize('medium')"
              >
                <Icon name="lucide:square-stack" class="w-4 h-4 mr-2" />
                Средняя
              </Button>
              <Button
                variant="outline"
                size="sm"
                :disabled="selectedCategories.length === 0"
                class="transition-all hover:scale-105"
                @click="setSize('large')"
              >
                <Icon name="lucide:maximize-2" class="w-4 h-4 mr-2" />
                Большая
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- Загрузка -->
        <div v-if="isLoading" class="text-center py-20">
          <div class="inline-flex flex-col items-center gap-4">
            <div class="relative">
              <div class="w-16 h-16 rounded-full border-4 border-primary/20" />
              <Icon name="lucide:loader-2" class="w-16 h-16 animate-spin absolute inset-0 text-primary" />
            </div>
            <p class="text-muted-foreground font-medium">
              Загрузка категорий...
            </p>
          </div>
        </div>

        <!-- Табы с улучшенным дизайном -->
        <Tabs v-else v-model="activeTab" class="w-full">
          <TabsList class="grid w-full max-w-md grid-cols-2 mb-6 h-12 p-1">
            <TabsTrigger value="preview" class="data-[state=active]:shadow-md">
              <Icon name="lucide:layout-grid" class="w-4 h-4 mr-2" />
              Предпросмотр
            </TabsTrigger>
            <TabsTrigger value="manage" class="data-[state=active]:shadow-md">
              <Icon name="lucide:list" class="w-4 h-4 mr-2" />
              Управление
            </TabsTrigger>
          </TabsList>

          <!-- Вкладка: Предпросмотр сетки -->
          <TabsContent value="preview" class="mt-0">
            <Card class="border-2 shadow-lg">
              <CardHeader class="border-b bg-muted/30">
                <CardTitle class="flex items-center gap-2">
                  <Icon name="lucide:eye" class="w-5 h-5 text-primary" />
                  Предпросмотр сетки каталога
                </CardTitle>
                <p class="text-sm text-muted-foreground">
                  Так будут выглядеть категории на странице каталога
                </p>
              </CardHeader>
              <CardContent class="p-6">
                <!-- Симуляция настоящей сетки каталога -->
                <div class="grid grid-cols-2 gap-2 auto-rows-[180px]">
                  <!-- Дополнительные пункты -->
                  <div
                    v-for="item in additionalItems"
                    :key="item.id"
                    class="relative overflow-hidden rounded-2xl border-2 border-border/50 h-[180px] shadow-sm bg-muted hover:shadow-md transition-all hover:scale-[1.02]"
                  >
                    <div class="absolute bottom-0 left-0 right-0 p-4">
                      <div class="space-y-2">
                        <div class="w-12 h-12 rounded-xl bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                          <Icon :name="item.icon" class="w-6 h-6 text-foreground" />
                        </div>
                        <h3 class="font-semibold text-foreground leading-tight text-base">
                          {{ item.name }}
                        </h3>
                      </div>
                    </div>
                    <div class="absolute top-3 right-3 w-8 h-8 rounded-lg bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                      <Icon name="lucide:chevron-right" class="w-4 h-4 text-foreground" />
                    </div>
                  </div>

                  <!-- Категории -->
                  <div
                    v-for="category in secondLevelCategories"
                    :key="category.id"
                    class="relative overflow-hidden rounded-2xl border-2 transition-all cursor-pointer group shadow-sm hover:shadow-lg"
                    :class="[
                      selectedCategories.includes(category.id)
                        ? 'border-primary shadow-lg ring-4 ring-primary/20 scale-[1.02]'
                        : 'border-border/50 hover:border-primary/50 hover:scale-[1.02]',
                      getCategorySize(category) === 'large'
                        ? 'row-span-2 h-auto'
                        : getCategorySize(category) === 'medium'
                          ? 'row-span-2 h-auto'
                          : 'h-[180px]',
                    ]"
                    @click="toggleSelection(category.id)"
                  >
                    <!-- Изображение категории -->
                    <div v-if="category.image_url" class="absolute inset-0">
                      <img
                        :src="getImageUrl(BUCKET_NAME_CATEGORY, category.image_url, IMAGE_SIZES.CATEGORY_MENU) || ''"
                        :alt="category.name"
                        class="w-full h-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      >
                    </div>

                    <!-- Фоллбэк без изображения -->
                    <div
                      v-else
                      class="absolute inset-0 bg-muted flex items-center justify-center"
                    >
                      <Icon
                        :name="category.icon_name || 'lucide:package'"
                        class="w-16 h-16 text-muted-foreground opacity-40"
                      />
                    </div>

                    <!-- Контент -->
                    <div class="absolute bottom-0 left-0 right-0 p-4">
                      <div class="space-y-2">
                        <Badge
                          :variant="sizeColors[getCategorySize(category)]"
                          class="w-fit shadow-sm"
                        >
                          {{ sizeLabels[getCategorySize(category)] }}
                        </Badge>

                        <h3
                          class="font-semibold text-white leading-tight drop-shadow-lg"
                          :class="getCategorySize(category) === 'large' ? 'text-lg' : 'text-base'"
                        >
                          {{ category.name }}
                        </h3>

                        <p
                          v-if="category.description && getCategorySize(category) !== 'small'"
                          class="text-xs text-white/95 leading-snug drop-shadow-md line-clamp-2"
                        >
                          {{ category.description }}
                        </p>
                      </div>
                    </div>

                    <!-- Индикатор выбора -->
                    <div
                      v-if="selectedCategories.includes(category.id)"
                      class="absolute top-3 right-3 w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg z-10 animate-in zoom-in-50"
                    >
                      <Icon name="lucide:check" class="w-5 h-5 text-primary-foreground" />
                    </div>

                    <!-- Иконка стрелки -->
                    <div
                      v-else
                      class="absolute top-3 right-3 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                    >
                      <Icon name="lucide:chevron-right" class="w-5 h-5 text-foreground" />
                    </div>

                    <!-- Hover эффект -->
                    <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                <!-- Пустое состояние -->
                <div
                  v-if="secondLevelCategories.length === 0"
                  class="text-center py-20"
                >
                  <div class="inline-flex flex-col items-center gap-4">
                    <div class="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
                      <Icon name="lucide:folder-x" class="w-10 h-10 text-muted-foreground opacity-50" />
                    </div>
                    <div>
                      <p class="text-lg font-semibold text-foreground mb-1">
                        Категории не найдены
                      </p>
                      <p class="text-sm text-muted-foreground">
                        Добавьте категории второго уровня для отображения
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <!-- Вкладка: Управление списком -->
          <TabsContent value="manage" class="mt-0">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Обычные -->
              <Card class="border-2 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader class="border-b bg-muted/30">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Icon name="lucide:square" class="w-5 h-5 text-primary" />
                      <CardTitle class="text-base">
                        Обычные
                      </CardTitle>
                    </div>
                    <Badge variant="default" class="text-sm">
                      {{ categoriesBySize.small.length }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground mt-2">
                    Компактная высота (1 клетка)
                  </p>
                </CardHeader>
                <CardContent class="h-96 overflow-y-auto p-3 space-y-2">
                  <div
                    v-for="item in categoriesBySize.small"
                    :key="item.id"
                    class="p-3 rounded-xl cursor-pointer border-2 transition-all hover:shadow-md"
                    :class="
                      selectedCategories.includes(item.id)
                        ? 'bg-primary/10 border-primary shadow-md scale-[1.02]'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/50'
                    "
                    @click="toggleSelection(item.id)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm truncate">
                          {{ item.name }}
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          порядок: {{ item.display_order }}
                        </div>
                      </div>
                      <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0 text-xs">
                        {{ sizeLabels[getCategorySize(item)] }}
                      </Badge>
                    </div>
                  </div>
                  <div v-if="categoriesBySize.small.length === 0" class="text-center py-12">
                    <Icon name="lucide:inbox" class="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p class="text-sm text-muted-foreground">
                      Нет категорий
                    </p>
                  </div>
                </CardContent>
              </Card>

              <!-- Средние -->
              <Card class="border-2 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader class="border-b bg-muted/30">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Icon name="lucide:square-stack" class="w-5 h-5 text-primary" />
                      <CardTitle class="text-base">
                        Средние
                      </CardTitle>
                    </div>
                    <Badge variant="secondary" class="text-sm">
                      {{ categoriesBySize.medium.length }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground mt-2">
                    Средняя высота (2 клетки)
                  </p>
                </CardHeader>
                <CardContent class="h-96 overflow-y-auto p-3 space-y-2">
                  <div
                    v-for="item in categoriesBySize.medium"
                    :key="item.id"
                    class="p-3 rounded-xl cursor-pointer border-2 transition-all hover:shadow-md"
                    :class="
                      selectedCategories.includes(item.id)
                        ? 'bg-primary/10 border-primary shadow-md scale-[1.02]'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/50'
                    "
                    @click="toggleSelection(item.id)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm truncate">
                          {{ item.name }}
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          порядок: {{ item.display_order }}
                        </div>
                      </div>
                      <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0 text-xs">
                        {{ sizeLabels[getCategorySize(item)] }}
                      </Badge>
                    </div>
                  </div>
                  <div v-if="categoriesBySize.medium.length === 0" class="text-center py-12">
                    <Icon name="lucide:inbox" class="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p class="text-sm text-muted-foreground">
                      Нет категорий
                    </p>
                  </div>
                </CardContent>
              </Card>

              <!-- Большие -->
              <Card class="border-2 shadow-lg hover:shadow-xl transition-shadow">
                <CardHeader class="border-b bg-muted/30">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <Icon name="lucide:maximize-2" class="w-5 h-5 text-primary" />
                      <CardTitle class="text-base">
                        Большие
                      </CardTitle>
                    </div>
                    <Badge variant="destructive" class="text-sm">
                      {{ categoriesBySize.large.length }}
                    </Badge>
                  </div>
                  <p class="text-xs text-muted-foreground mt-2">
                    Акцентная высота (2 клетки)
                  </p>
                </CardHeader>
                <CardContent class="h-96 overflow-y-auto p-3 space-y-2">
                  <div
                    v-for="item in categoriesBySize.large"
                    :key="item.id"
                    class="p-3 rounded-xl cursor-pointer border-2 transition-all hover:shadow-md"
                    :class="
                      selectedCategories.includes(item.id)
                        ? 'bg-primary/10 border-primary shadow-md scale-[1.02]'
                        : 'border-border/50 hover:border-primary/30 hover:bg-muted/50'
                    "
                    @click="toggleSelection(item.id)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <div class="font-semibold text-sm truncate">
                          {{ item.name }}
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          порядок: {{ item.display_order }}
                        </div>
                      </div>
                      <Badge :variant="sizeColors[getCategorySize(item)]" class="shrink-0 text-xs">
                        {{ sizeLabels[getCategorySize(item)] }}
                      </Badge>
                    </div>
                  </div>
                  <div v-if="categoriesBySize.large.length === 0" class="text-center py-12">
                    <Icon name="lucide:inbox" class="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-30" />
                    <p class="text-sm text-muted-foreground">
                      Нет категорий
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <!-- Информационная панель с улучшенным дизайном -->
        <Card class="mt-6 border-2 shadow-sm">
          <CardHeader class="pb-3 bg-muted/20">
            <CardTitle class="text-base flex items-center gap-2">
              <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon name="lucide:lightbulb" class="w-4 h-4 text-primary" />
              </div>
              Как это работает
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-3 text-sm">
            <div class="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Icon name="lucide:square" class="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <strong class="text-foreground">Обычная карточка:</strong>
                <span class="text-muted-foreground"> Стандартная высота (180px), 1 клетка</span>
              </div>
            </div>
            <div class="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Icon name="lucide:square-stack" class="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <strong class="text-foreground">Средняя карточка:</strong>
                <span class="text-muted-foreground"> Двойная высота (360px), 2 клетки, показывает описание</span>
              </div>
            </div>
            <div class="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <Icon name="lucide:maximize-2" class="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <strong class="text-foreground">Большая карточка:</strong>
                <span class="text-muted-foreground"> Двойная высота (360px), акцентная с описанием</span>
              </div>
            </div>
            <div class="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border-l-4 border-primary mt-4">
              <Icon name="lucide:info" class="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p class="text-muted-foreground">
                Все карточки занимают 1 колонку по ширине, но различаются по высоте (1 или 2 клетки)
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </ClientOnly>
</template>
