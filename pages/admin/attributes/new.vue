<script setup lang="ts">
import type { AttributeInsert } from '@/types'
import { useAdminAttributesStore } from '@/stores/adminStore/adminAttributesStore'
import { slugify } from '@/utils/slugify'

definePageMeta({ layout: 'admin' })

const attributesStore = useAdminAttributesStore()
const router = useRouter()

const formData = ref<Partial<AttributeInsert>>({
  name: '',
  slug: '',
  display_type: 'select',
})

function autoFillSlug() {
  if (formData.value.name) {
    formData.value.slug = slugify(formData.value.name)
  }
}

async function handleSubmit() {
  const newAttribute = await attributesStore.createAttribute(formData.value as AttributeInsert)
  if (newAttribute) {
    router.push('/admin/attributes') // Или на страницу редактирования
  }
}
</script>

<template>
  <div class="p-8 max-w-2xl mx-auto">
    <h1 class="text-3xl font-bold mb-6">
      Новый атрибут
    </h1>
    <form class="space-y-6" @submit.prevent="handleSubmit">
      <Card>
        <CardHeader><CardTitle>Основная информация</CardTitle></CardHeader>
        <CardContent class="space-y-4">
          <div>
            <Label for="name">Название *</Label>
            <Input id="name" v-model="formData.name" @blur="autoFillSlug" />
          </div>
          <div>
            <Label for="slug">Слаг (URL) *</Label>
            <Input id="slug" v-model="formData.slug" />
          </div>
          <div>
            <Label for="display_type">Тип отображения в фильтре</Label>
            <Select v-model="formData.display_type">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="select">
                  Чекбоксы (для выбора значений)
                </SelectItem>
                <SelectItem value="color">
                  Кружки с цветом
                </SelectItem>
                <SelectItem value="range">
                  Ползунок (для чисел)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Button type="submit">
        Сохранить атрибут
      </Button>
    </form>
  </div>
</template>
