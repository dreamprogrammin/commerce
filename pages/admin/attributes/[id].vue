<script setup lang="ts">
import type { Attribute, AttributeOption, AttributeOptionInsert } from '@/types'
import { storeToRefs } from 'pinia'
import { useAdminAttributesStore } from '@/stores/adminStore/adminAttributesStore'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const attributeId = Number(route.params.id)

const attributesStore = useAdminAttributesStore()
const { categories } = storeToRefs(attributesStore)

// Локальное состояние
const currentAttribute = ref<Attribute | null>(null)
const options = ref<AttributeOption[]>([])
const linkedCategoryIds = ref<string[]>([])
const newOptionValue = ref('')

function updateLinkedCategoriesSelection(checked: boolean, categoryId: string) {
  const newIds = new Set(linkedCategoryIds.value)
  if (checked) {
    newIds.add(categoryId)
  }
  else {
    newIds.delete(categoryId)
  }
  linkedCategoryIds.value = Array.from(newIds)
}

// Загрузка всех данных при открытии страницы
onMounted(async () => {
  // Загружаем сам атрибут (нужно будет создать метод fetchAttributeById в сторе)
  // currentAttribute.value = await attributesStore.fetchAttributeById(attributeId);

  // Пока для простоты найдем его в существующем списке
  await attributesStore.fetchAttributes()
  currentAttribute.value = attributesStore.attributes.find(a => a.id === attributeId) || null

  if (currentAttribute.value) {
    // Параллельно загружаем опции и связанные категории
    await Promise.all([
      attributesStore.fetchOptionsForAttribute(attributeId).then(data => options.value = data),
      attributesStore.getLinkedCategoryIds(attributeId).then(data => linkedCategoryIds.value = data),
      attributesStore.fetchAllCategories(),
    ])
  }
})

// Функция для добавления новой опции (например, нового цвета)
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

// Функция для сохранения связей с категориями
async function handleSaveCategoryLinks() {
  await attributesStore.updateLinkedCategories(attributeId, linkedCategoryIds.value)
}
</script>

<template>
  <div v-if="currentAttribute" class="p-8 max-w-4xl mx-auto">
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
              :checked="linkedCategoryIds.includes(category.id)"
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
</template>
