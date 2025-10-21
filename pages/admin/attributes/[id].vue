<script setup lang="ts">
import type { Attribute, AttributeOption, AttributeOptionInsert } from '@/types'
import { storeToRefs } from 'pinia'
import { useAdminAttributesStore } from '@/stores/adminStore/adminAttributesStore'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const attributeId = Number(route.params.id)

const attributesStore = useAdminAttributesStore()
const { categories } = storeToRefs(attributesStore)

// --- 1. ГЛАВНЫЙ ЗАГРУЗЧИК ДАННЫХ ---
const { data, pending: isLoading } = await useAsyncData(
  `admin-attribute-${attributeId}`,
  async () => {
    // Просто ждем выполнения всех промисов
    const [attributeData, optionsData, linkedIdsData] = await Promise.all([
      attributesStore.fetchAttributeById(attributeId),
      attributesStore.fetchOptionsForAttribute(attributeId),
      attributesStore.getLinkedCategoryIds(attributeId),
      attributesStore.fetchAllCategories(), // <-- Выполняется параллельно, но результат игнорируется
    ])

    if (!attributeData) {
      throw createError({ statusCode: 404, statusMessage: 'Атрибут не найден' })
    }

    // Возвращаем только те данные, которые нам нужны для `data`
    return {
      attribute: attributeData,
      options: optionsData,
      linkedCategoryIds: linkedIdsData,
    }
  },
)

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ (синхронизируется с data) ---
const currentAttribute = computed(() => data.value?.attribute || null)
const options = ref(data.value?.options || [])
const linkedCategoryIds = ref(data.value?.linkedCategoryIds || [])
const newOptionValue = ref('')

// --- 3. ФУНКЦИИ-ОБРАБОТЧИКИ ---
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
  if (newOption) {
    options.value.push(newOption)
    newOptionValue.value = ''
  }
}

async function handleSaveCategoryLinks() {
  await attributesStore.updateLinkedCategories(attributeId, linkedCategoryIds.value)
}
</script>

<template>
  <div v-if="currentAttribute" class="p-8 max-w-4xl mx-auto">
    <div v-if="isLoading" class="text-center">
      Загрузка...
    </div>
    <div v-else-if="currentAttribute">
      <h1 class="text-3xl font-bold mb-6">
        Редактирование атрибута: {{ currentAttribute.name }}
      </h1>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- Блок: Управление опциями -->
        <Card v-if="currentAttribute.display_type !== 'range'">
          <CardHeader>
            <CardTitle>Опции атрибута</CardTitle>
            <CardDescription>
              Возможные значения для выбора в фильтре (например, "Красный", "Синий").
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul class="space-y-2 mb-4">
              <li v-for="option in options" :key="option.id" class="text-sm p-2 bg-muted rounded">
                {{ option.value }}
              <!-- TODO: Кнопка удаления опции -->
              </li>
            </ul>
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
              Для атрибутов типа "ползунок" опции не требуются.
            </p>
          </CardContent>
        </Card>

        <!-- Блок: Привязка к категориям -->
        <Card>
          <CardHeader>
            <CardTitle>Использовать в категориях</CardTitle>
            <CardDescription>
              Выберите, в каких категориях будет отображаться этот фильтр.
            </CardDescription>
          </CardHeader>
          <CardContent class="max-h-96 overflow-y-auto space-y-2">
            <div v-for="category in categories" :key="category.id" class="flex items-center space-x-2">
              <Checkbox
                :id="`cat-${category.id}`"
                :model-value="linkedCategoryIds.includes(category.id)"
                @update:model-value="(checkedState) => {
                  // Вызываем функцию, которая обновит наш массив
                  updateLinkedCategoriesSelection(!!checkedState, category.id)
                }"
              />
              <label :for="`cat-${category.id}`" class="text-sm font-medium leading-none">
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
    <div v-else class="text-center text-destructive">
      Атрибут не найден.
    </div>
  </div>
</template>
