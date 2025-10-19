<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAdminAttributesStore } from '@/stores/adminStore/adminAttributesStore'

definePageMeta({ layout: 'admin' })

const attributesStore = useAdminAttributesStore()
const { attributes, isLoading } = storeToRefs(attributesStore)

onMounted(() => {
  if (attributes.value.length === 0) {
    attributesStore.fetchAttributes()
  }
})
</script>

<template>
  <div class="container mx-auto p-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Управление атрибутами (фильтрами)
      </h1>
      <NuxtLink to="/admin/attributes/new">
        <Button>Создать атрибут</Button>
      </NuxtLink>
    </div>
    <div v-if="isLoading">
      Загрузка...
    </div>
    <div v-else class="border rounded-lg bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название атрибута</TableHead>
            <TableHead>Слаг</TableHead>
            <TableHead>Тип отображения</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="attr in attributes" :key="attr.id">
            <TableCell class="font-medium">
              {{ attr.name }}
            </TableCell>
            <TableCell>{{ attr.slug }}</TableCell>
            <TableCell>{{ attr.display_type }}</TableCell>
            <!-- TODO: Кнопки Редактировать/Удалить -->
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
