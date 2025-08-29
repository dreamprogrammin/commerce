<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
  const selectionRef
    = list === 'available' ? selectedAvailable : selectedFeatured
  const index = selectionRef.value.indexOf(id)
  if (index > -1) {
    selectionRef.value.splice(index, 1)
  }
  else {
    selectionRef.value.push(id)
  }
}

onMounted(async () => {
  await adminCategoriesStore.fetchAllCategories()
})

// Функции для перемещения
function moveToAvailable() {
  adminCategoriesStore.updateFeaturedStatus(selectedAvailable.value, true)
  selectedAvailable.value = []
}

function moveToFeatured() {
  adminCategoriesStore.updateFeaturedStatus(selectedFeatured.value, false)
  selectedAvailable.value = []
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

    <div v-if="adminCategoriesStore.isLoading" class="text-center py-20">
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
