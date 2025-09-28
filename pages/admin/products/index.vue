<script setup lang="ts">
import type { FullProduct } from '@/types'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const { getPublicUrl } = useSupabaseStorage()
const router = useRouter()

// Получаем реактивные ссылки на состояние из стора
const { products, isLoading } = storeToRefs(adminProductsStore)

// Загружаем список всех товаров при первом открытии страницы
onMounted(() => {
  // Вызываем `fetchProducts` только если список еще не загружен
  if (products.value.length === 0) {
    adminProductsStore.fetchProducts()
  }
})

// Функция для подтверждения удаления
function confirmDelete(product: FullProduct) {
  if (toast.info(`Вы уверены, что хотите удалить товар "${product.name}"? Это действие необратимо.`)) {
    adminProductsStore.deleteProduct(product)
  }
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <!-- Шапка страницы -->
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Управление товарами
      </h1>
      <NuxtLink to="/admin/products/new">
        <Button>Добавить товар</Button>
      </NuxtLink>
    </div>

    <!-- Состояние загрузки -->
    <div v-if="isLoading" class="text-center py-10">
      Загрузка...
    </div>

    <!-- Таблица с товарами -->
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
          <!-- Состояние, когда товаров нет -->
          <TableRow v-if="products.length === 0">
            <TableCell colspan="7" class="h-24 text-center">
              Товары еще не добавлены.
            </TableCell>
          </TableRow>

          <!-- Рендерим строки таблицы для каждого товара -->
          <TableRow v-for="product in products" :key="product.id">
            <TableCell>
              <div class="w-16 h-16 bg-muted rounded-md overflow-hidden relative">
                <NuxtImg
                  v-if="product.product_images && product.product_images.length > 0"
                  :src="getPublicUrl(BUCKET_NAME_PRODUCT, product.product_images[0]?.image_url || null) || undefined"
                  :alt="product.name"
                  class="w-full h-full object-cover"
                  format="webp"
                  quality="80"
                />
                <div v-if="product.product_images && product.product_images.length > 1" class="absolute bottom-0 right-0 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-tl-md">
                  +{{ product.product_images.length - 1 }}
                </div>
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
              <Button variant="destructive" size="sm" @click="confirmDelete(product)">
                Удалить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  </div>
</template>
