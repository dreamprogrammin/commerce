<script setup lang="ts">
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const router = useRouter()

onMounted(() => {
  adminProductsStore.fetchProducts()
})
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Управление товарами
      </h1>
      <NuxtLink to="/admin/products/new">
        <Button>Добавить товар</Button>
      </NuxtLink>
    </div>

    <div v-if="adminProductsStore.isLoading" class="text-center py-10">
      Загрузка...
    </div>
    <div v-else class="border rounded-lg bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead class="w-[80px]">
              Фото
            </TableHead>
            <TableHead>Название</TableHead>
            <TableHead>Категория</TableHead>
            <TableHead>Цена</TableHead>
            <TableHead>Остаток</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead class="text-right">
              Действия
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-if="adminProductsStore.products.length === 0">
            <TableCell colspan="7" class="h-24 text-center">
              Товары еще не добавлены.
            </TableCell>
          </TableRow>
          <TableRow v-for="product in adminProductsStore.products" :key="product.id">
            <TableCell>
              <div class="w-16 h-16 bg-muted rounded-md overflow-hidden">
                <NuxtImg
                  v-if="product.image_url"
                  :src="`${BUCKET_NAME_PRODUCT}/${product.image_url}`"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                  format="webp"
                  quality="80"
                />
              </div>
            </TableCell>
            <TableCell class="font-medium">
              {{ product.name }}
            </TableCell>
            <TableCell>{{ product.categories?.name || 'Без категории' }}</TableCell>
            <TableCell>{{ product.price }} ₸</TableCell>
            <TableCell>{{ product.stock_quantity }} шт.</TableCell>
            <TableCell>
              <Badge :variant="product.is_active ? 'default' : 'outline'">
                {{ product.is_active ? 'Активен' : 'Скрыт' }}
              </Badge>
            </TableCell>
            <TableCell class="text-right space-x-2">
              <Button variant="outline" size="sm" @click="router.push(`/admin/products/${product.id}`)">
                Редактировать
              </Button>
              <Button variant="destructive" size="sm" @click="adminProductsStore.deleteProduct(product)">
                Удалить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
