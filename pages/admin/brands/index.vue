<script setup lang="ts">
import type { Brand } from '@/types'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAdminBrandsStore } from '@/stores/adminStore/adminBrandsStore'

definePageMeta({ layout: 'admin' })

const brandsStore = useAdminBrandsStore()
const { brands, isLoading } = storeToRefs(brandsStore)

onMounted(() => {
  brandsStore.fetchBrands()
})

// Логика удаления
async function confirmDelete(brand: Brand) {
  if (toast.info(`Вы уверены, что хотите удалить бренд "${brand.name}"? Это действие необратимо и может повлиять на товары.`)) {
    await brandsStore.deleteBrand(brand)
  }
}
</script>

<template>
  <div class="container mx-auto p-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Управление брендами
      </h1>
      <NuxtLink to="/admin/brands/new">
        <Button>Добавить новый бренд</Button>
      </NuxtLink>
    </div>

    <div v-if="isLoading">
      Загрузка...
    </div>
    <div v-else class="border rounded-lg bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Слаг (URL)</TableHead>
            <TableHead class="text-right">
              Действия
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="brands.length === 0">
            <TableCell colspan="3" class="h-24 text-center">
              Бренды не найдены.
            </TableCell>
          </TableRow>
          <TableRow v-for="brand in brands" :key="brand.id">
            <TableCell class="font-medium">
              {{ brand.name }}
            </TableCell>
            <TableCell class="text-muted-foreground">
              {{ brand.slug }}
            </TableCell>
            <TableCell class="text-right space-x-2">
              <NuxtLink :to="`/admin/brands/${brand.id}`">
                <Button variant="outline" size="sm">
                  Редактировать
                </Button>
              </NuxtLink>
              <Button variant="destructive" size="sm" @click="confirmDelete(brand)">
                Удалить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
