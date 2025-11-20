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

// Получаем только подкатегории второго уровня
const secondLevelCategories = computed(() => {
  return adminCategoriesStore.allCategories.filter((cat) => {
    if (!cat.parent_id)
      return false
    const parent = adminCategoriesStore.allCategories.find(c => c.id === cat.parent_id)
    return parent?.is_root_category === true
  }).sort((a, b) => a.display_order - b.display_order)
})

// Группируем по размерам (упрощено: маленькие и большие)
const categoriesBySize = computed(() => {
  const small: CategoryRow[] = []
  const large: CategoryRow[] = []

  secondLevelCategories.value.forEach((cat) => {
    const order = cat.featured_order ?? 0
    if (order >= 50) {
      large.push(cat)
    }
    else {
      small.push(cat)
    }
  })

  return { small, large }
})

const originalFeaturedOrders = ref<Map<string, number>>(new Map())

watch(() => adminCategoriesStore.allCategories, (categories) => {
  if (categories.length > 0 && originalFeaturedOrders.value.size === 0) {
    categories.forEach((cat) => {
      originalFeaturedOrders.value.set(cat.id, cat.featured_order ?? 0)
    })
  }
}, { immediate: true })

const hasChanges = computed(() => {
  return adminCategoriesStore.allCategories.some((cat) => {
    const original = originalFeaturedOrders.value.get(cat.id)
    return original !== (cat.featured_order ?? 0)
  })
})

const selectedCategories = ref<string[]>([])

function toggleSelection(id: string) {
  const index = selectedCategories.value.indexOf(id)
  if (index > -1) {
    selectedCategories.value.splice(index, 1)
  }
  else {
    selectedCategories.value.push(id)
  }
}

// Установка размера (упрощено)
function setSize(size: 'small' | 'large') {
  if (selectedCategories.value.length === 0) {
    toast.error('Выберите категории для изменения размера')
    return
  }

  const newOrder = size === 'large' ? 80 : 10

  adminCategoriesStore.allCategories.forEach((cat, index) => {
    if (selectedCategories.value.includes(cat.id)) {
      adminCategoriesStore.allCategories[index] = {
        ...cat,
        featured_order: newOrder,
      }
    }
  })

  selectedCategories.value = []
  toast.success(`Размер "${size === 'large' ? 'большой' : 'маленький'}" установлен`)
}

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

async function saveChanges() {
  isSaving.value = true

  try {
    const supabase = useSupabaseClient()

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

function isLargeCard(category: CategoryRow): boolean {
  return (category.featured_order ?? 0) >= 50
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
          Два размера карточек: маленькие (1 клетка) и большие (2 клетки высоты)
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
          Сохранить
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
            Маленькая (1 клетка)
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="selectedCategories.length === 0"
            @click="setSize('large')"
          >
            <Icon name="lucide:square-stack" class="w-4 h-4 mr-2" />
            Большая (2 клетки)
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

    <!-- Предпросмотр сетки -->
    <div v-else>
      <Card class="mb-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Icon name="lucide:eye" class="w-5 h-5" />
            Предпросмотр сетки
          </CardTitle>
          <p class="text-sm text-muted-foreground">
            Так будут выглядеть категории в каталоге. Кликните для выбора.
          </p>
        </CardHeader>
        <CardContent>
          <!-- Grid сетка как в реальном каталоге -->
          <div class="grid grid-cols-2 gap-3 auto-rows-[180px]">
            <div
              v-for="category in secondLevelCategories"
              :key="category.id"
              class="relative overflow-hidden rounded-lg border-2 transition-all cursor-pointer group"
              :class="[
                selectedCategories.includes(category.id)
                  ? 'border-primary shadow-lg ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50',
                isLargeCard(category) ? 'row-span-2 h-auto' : 'h-[180px]',
              ]"
              @click="toggleSelection(category.id)"
            >
              <!-- Изображение -->
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

              <!-- Оверлей -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              <!-- Контент -->
              <div class="absolute bottom-0 left-0 right-0 p-3 text-white">
                <!-- Бейдж размера -->
                <Badge
                  :variant="isLargeCard(category) ? 'destructive' : 'default'"
                  class="mb-2"
                >
                  {{ isLargeCard(category) ? 'Большая' : 'Маленькая' }}
                </Badge>

                <!-- Название -->
                <h3
                  class="font-bold" :class="[
                    isLargeCard(category) ? 'text-lg mb-1' : 'text-base',
                  ]"
                >
                  {{ category.name }}
                </h3>

                <!-- Описание только для больших -->
                <p
                  v-if="category.description && isLargeCard(category)"
                  class="text-xs text-white/80 line-clamp-2"
                >
                  {{ category.description }}
                </p>
              </div>

              <!-- Чекбокс -->
              <div
                v-if="selectedCategories.includes(category.id)"
                class="absolute top-2 right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center shadow-lg"
              >
                <Icon name="lucide:check" class="w-4 h-4 text-primary-foreground" />
              </div>

              <!-- Hover -->
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
          </div>
        </CardContent>
      </Card>

      <!-- Списки категорий -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Маленькие -->
        <Card>
          <CardHeader>
            <CardTitle class="flex items-center justify-between">
              <span>Маленькие</span>
              <Badge variant="default">
                {{ categoriesBySize.small.length }}
              </Badge>
            </CardTitle>
            <p class="text-xs text-muted-foreground">
              Стандартная карточка (180px высота, 1 клетка)
            </p>
          </CardHeader>
          <CardContent class="h-96 overflow-y-auto space-y-2">
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
                <Badge variant="default" class="shrink-0">
                  Маленькая
                </Badge>
              </div>
            </div>
            <div v-if="categoriesBySize.small.length === 0" class="text-center py-8 text-muted-foreground text-sm">
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
              Высокая карточка (360px высота, 2 клетки)
            </p>
          </CardHeader>
          <CardContent class="h-96 overflow-y-auto space-y-2">
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
                <Badge variant="destructive" class="shrink-0">
                  Большая
                </Badge>
              </div>
            </div>
            <div v-if="categoriesBySize.large.length === 0" class="text-center py-8 text-muted-foreground text-sm">
              Нет категорий
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Информация -->
      <Card class="mt-6">
        <CardHeader>
          <CardTitle class="text-base">
            <Icon name="lucide:info" class="w-4 h-4 inline mr-2" />
            Как это работает
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-2 text-sm text-muted-foreground">
          <p>
            • <strong>Маленькая карточка:</strong> Занимает 1 клетку по высоте (180px), показывает только название
          </p>
          <p>
            • <strong>Большая карточка:</strong> Занимает 2 клетки по высоте (360px), показывает название + описание
          </p>
          <p class="text-xs pt-2 border-t">
            💡 Совет: Используйте большие карточки для акцентирования важных категорий
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
