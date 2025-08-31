<script setup lang="ts">
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'

definePageMeta({ layout: 'admin' })

const adminCategoriesStore = useAdminCategoriesStore()
const isSaving = ref(false)

const available = computed(() => adminCategoriesStore.allCategories.filter(cat => !cat.is_featured))
const featured = computed(() => adminCategoriesStore.allCategories.filter(cat => cat.is_featured))

const selectedAvailable = ref<string[]>([])
const selectedFeatured = ref<string[]>([])

function toggleSelection(list: 'available' | 'featured', id: string) {
  const selectionRef = list === 'available' ? selectedAvailable : selectedFeatured
  // Создаем копию текущего массива
  const newSelection = [...selectionRef.value]
  const index = newSelection.indexOf(id)

  if (index > -1) {
    // Если элемент уже есть, удаляем его
    newSelection.splice(index, 1)
  }
  else {
    // Если элемента нет, добавляем его
    newSelection.push(id)
  }

  // Полностью заменяем старый массив на новый.
  // Это "громкое" изменение, которое Vue точно не пропустит.
  selectionRef.value = newSelection
}
const { pending: isLoading } = useAsyncData(
  'admin-all-categories', // Уникальный ключ
  () => adminCategoriesStore.fetchAllCategories(),
  {
    // `lazy: false` (по умолчанию) означает, что Nuxt дождется загрузки данных
    // перед тем как отрендерить страницу. Это идеально для админки.
  },
)

// Функции для перемещения
function moveToFeatured() {
  // 1. Берем ID из левого списка `selectedAvailable`.
  const idsToMove = selectedAvailable.value

  // 2. Устанавливаем им флаг `is_featured = true`.
  adminCategoriesStore.updateFeaturedStatus(idsToMove, true)

  // 3. Очищаем выбор в левом списке.
  selectedAvailable.value = []
}

/**
 * Перемещает выбранные элементы из "Популярных" (справа)
 * в "Доступные" (слева).
 * Вызывается кнопкой `<`.
 */
function moveToAvailable() {
  // 1. Берем ID из правого списка `selectedFeatured`.
  const idsToMove = selectedFeatured.value

  // 2. Устанавливаем им флаг `is_featured = false`.
  adminCategoriesStore.updateFeaturedStatus(idsToMove, false)

  // 3. Очищаем выбор в правом списке.
  selectedFeatured.value = []
}

async function saveChanges() {
  isSaving.value = true
  const success = await adminCategoriesStore.saveFeaturedChanges()
  if (success) {
    toast.success('Список популярных категорий успешно сохранен!')
  }
  else {
    toast.error('Не удалось сохранить изменения.')
  }
  isSaving.value = false
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div
      class="flex flex-col md:flex-row items-center justify-between gap-4 mb-6"
    >
      <h1 class="text-3xl font-bold text-foreground">
        Управление популярными категориями
      </h1>
      <Button :disabled="isSaving" @click="saveChanges">
        Сохранить список
      </Button>
    </div>

    <div v-if="isLoading" class="text-center py-20">
      Загрузка...
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
      <!-- Левая колонка: Доступные категории -->
      <Card>
        <CardHeader>
          <CardTitle>Доступные категории</CardTitle>
        </CardHeader>
        <CardContent class="h-96 overflow-y-auto space-y-1">
          <div
            v-for="item in available"
            :key="item.id"
            class="p-2 rounded-md cursor-pointer border transition-colors"
            :class="
              selectedAvailable.includes(item.id)
                ? 'bg-primary/20 border-primary'
                : 'hover:bg-muted/50'
            "
            @click="toggleSelection('available', item.id)"
          >
            {{ item.name }}
            <span v-if="!item.image_url" class="text-xs text-destructive ml-2">(нет фото)</span>
          </div>
        </CardContent>
      </Card>

      <!-- Правая колонка: Популярные категории -->
      <Card>
        <CardHeader class="flex flex-row items-center justify-between">
          <CardTitle>Популярные на главной</CardTitle>
          <div class="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              :disabled="selectedAvailable.length === 0"
              @click="moveToFeatured"
            />
            <Button
              variant="outline"
              size="icon"
              :disabled="selectedFeatured.length === 0"
              @click="moveToAvailable"
            />
            {{ selectedFeatured.length }}
            {{ selectedAvailable.length }}
          </div>
        </CardHeader>
        <CardContent class="h-96 overflow-y-auto space-y-1">
          <div
            v-for="item in featured"
            :key="item.id"
            class="p-2 rounded-md cursor-pointer border transition-colors"
            :class="
              selectedFeatured.includes(item.id)
                ? 'bg-primary/20 border-primary'
                : 'hover:bg-muted/50'
            "
            @click="toggleSelection('featured', item.id)"
          >
            {{ item.name }}
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
