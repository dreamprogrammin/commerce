<script setup lang="ts">
import type { CategoryRow } from '@/types'
import { toast } from 'vue-sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <Button :disabled="isSaving" @click="saveChanges">
        <Icon v-if="isSaving" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
        Сохранить изменения
      </Button>
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

    <!-- Сетка категорий по размерам -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            1 колонка, стандартная высота
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
            1 колонка, увеличенная высота
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
            2 колонки, акцентная карточка
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
          • <strong>Обычная карточка:</strong> Стандартный размер, занимает 1 колонку в сетке
        </p>
        <p>
          • <strong>Средняя карточка:</strong> Увеличенная высота, подходит для категорий с описанием
        </p>
        <p>
          • <strong>Большая карточка:</strong> Занимает 2 колонки, используется для акцентов и популярных разделов
        </p>
        <p class="text-xs pt-2 border-t">
          💡 Совет: Используйте не более 2-3 больших карточек на странице для максимального эффекта
        </p>
      </CardContent>
    </Card>
  </div>
</template>
