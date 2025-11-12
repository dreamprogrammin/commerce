<script setup lang="ts">
import type { Attribute, AttributeOptionInsert, SimpleAttributeOption } from '@/types'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAdminAttributesStore } from '@/stores/adminStore/adminAttributesStore'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const attributeId = Number(route.params.id)

const attributesStore = useAdminAttributesStore()
const { categories } = storeToRefs(attributesStore)

// --- 1. ГЛАВНЫЙ ЗАГРУЗЧИК ДАННЫХ ---
const currentAttribute = ref<Attribute | null>(null)
const options = ref<SimpleAttributeOption[]>([])
const linkedCategoryIds = ref<string[]>([])
const newOptionValue = ref('')
const isLoading = ref(true)

// --- 2. ЗАГРУЗКА ДАННЫХ В onMounted ---
// Этот подход проще для гидратации в админке, где SEO не так важно
onMounted(async () => {
  isLoading.value = true

  // Загружаем все параллельно
  const [attrData, optsData, linkedIdsData] = await Promise.all([
    attributesStore.fetchAttributeById(attributeId),
    attributesStore.fetchOptionsForAttribute(attributeId),
    attributesStore.getLinkedCategoryIds(attributeId),
    attributesStore.fetchAllCategories(),
  ])

  currentAttribute.value = attrData
  options.value = optsData
  linkedCategoryIds.value = linkedIdsData

  isLoading.value = false
})

// --- 3. ФУНКЦИИ-ОБРАБОТЧИКИ ---
// (Весь остальной код остается без изменений)

function updateLinkedCategoriesSelection(checked: boolean, categoryId: string) {
  const newIds = new Set(linkedCategoryIds.value)
  if (checked)
    newIds.add(categoryId)
  else newIds.delete(categoryId)
  linkedCategoryIds.value = Array.from(newIds)
}

async function handleAddOption() {
  if (!newOptionValue.value || !currentAttribute.value)
    return
  const optionData: AttributeOptionInsert = {
    attribute_id: currentAttribute.value.id,
    value: newOptionValue.value,
  }
  const newOption = await attributesStore.addOptionToAttribute(optionData)

  // Теперь эта строка не должна вызывать ошибку
  if (newOption) {
    options.value.push(newOption)
    newOptionValue.value = ''
  }
}

async function handleSaveCategoryLinks() {
  await attributesStore.updateLinkedCategories(attributeId, linkedCategoryIds.value)
}

// <-- ФУНКЦИЯ для удаления опции -->
async function handleDeleteOption(optionId: number) {
  const success = await attributesStore.deleteOption(optionId)
  if (success) {
    // Оптимистичное удаление из UI
    options.value = options.value.filter(opt => opt.id !== optionId)
  }
}

// <-- ФУНКЦИЯ для отмены выбора категорий -->
function clearCategorySelection() {
  linkedCategoryIds.value = []
  toast.info('Выбор категорий сброшен. Не забудьте сохранить изменения.')
}
</script>

<template>
  <div class="p-8 max-w-4xl mx-auto">
    <!-- 1. Показываем загрузчик, пока isLoading === true -->
    <div v-if="isLoading" class="text-center py-20">
      Загрузка данных атрибута...
    </div>

    <!-- 2. Если загрузка завершилась и есть данные (currentAttribute не null) -->
    <div v-else-if="currentAttribute" class="space-y-6">
      <h1 class="text-3xl font-bold mb-6">
        Настройка атрибута: <span class="text-primary">{{ currentAttribute.name }}</span>
      </h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <!-- Блок: Управление опциями -->
        <Card v-if="currentAttribute.display_type !== 'range'">
          <CardHeader>
            <CardTitle>Опции для выбора</CardTitle>
            <CardDescription>
              Возможные значения для этого фильтра (например, "Красный", "Синий").
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="options.length > 0" class="space-y-2 mb-4">
              <div v-for="option in options" :key="option.id" class="text-sm p-2 bg-muted rounded flex justify-between items-center group">
                <span>{{ option.value }}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                  @click="() => handleDeleteOption(option.id)"
                >
                  <X class="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p v-else class="text-sm text-muted-foreground mb-4">
              Опции еще не добавлены.
            </p>
            <form class="flex gap-2" @submit.prevent="handleAddOption">
              <Input v-model="newOptionValue" placeholder="Новое значение..." />
              <Button type="submit">
                Добавить
              </Button>
            </form>
          </CardContent>
        </Card>

        <!-- Пустышка для атрибутов типа range -->
        <Card v-else>
          <CardHeader>
            <CardTitle>Опции атрибута</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-muted-foreground">
              Для атрибутов типа "ползунок" (range) опции не требуются.
            </p>
          </CardContent>
        </Card>

        <!-- Блок: Привязка к категориям -->
        <Card class="md:col-span-2">
          <CardHeader>
            <div class="flex justify-between items-center">
              <div>
                <CardTitle>Использовать в категориях</CardTitle>
                <CardDescription>Выберите, где будет отображаться этот фильтр.</CardDescription>
              </div>
              <Button v-if="linkedCategoryIds.length > 0" type="button" variant="link" class="text-sm" @click="clearCategorySelection">
                Снять все
              </Button>
            </div>
          </CardHeader>
          <CardContent class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <div v-for="category in categories" :key="category.id" class="flex items-center space-x-2">
              <Checkbox
                :id="`cat-${category.id}`"
                :model-value="linkedCategoryIds.includes(category.id)"
                @update:model-value="(checkedState) => updateLinkedCategoriesSelection(!!checkedState, category.id)"
              />
              <label :for="`cat-${category.id}`" class="text-sm font-medium leading-none cursor-pointer">
                {{ category.name }}
              </label>
            </div>
          </CardContent>
          <CardFooter>
            <Button @click="handleSaveCategoryLinks">
              Сохранить связи
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>

    <!-- 3. Если загрузка завершилась, но данных нет (атрибут не найден) -->
    <div v-else class="text-center py-20 text-destructive">
      <p>Атрибут с ID {{ attributeId }} не найден.</p>
    </div>
  </div>
</template>
