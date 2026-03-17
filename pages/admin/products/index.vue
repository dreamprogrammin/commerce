<script setup lang="ts">
import type { ProductListAdmin } from '@/types'
import { MoreHorizontal, Package, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const router = useRouter()

const { products, isLoading } = storeToRefs(adminProductsStore)

// Поиск
const searchQuery = ref('')
const filteredProducts = computed(() => {
  if (!searchQuery.value)
    return products.value
  const q = searchQuery.value.toLowerCase()
  return products.value.filter(p =>
    p.name.toLowerCase().includes(q)
    || p.categories?.name?.toLowerCase().includes(q),
  )
})

// Массовая генерация вопросов
const { generateQuestionsForAllProducts } = useProductQuestions()
const isGeneratingAll = ref(false)

async function handleGenerateAllQuestions() {
  // eslint-disable-next-line no-alert
  if (!confirm('Это сгенерирует БАЗОВЫЕ вопросы для ВСЕХ товаров (без AI). Продолжить?'))
    return

  isGeneratingAll.value = true
  const result = await generateQuestionsForAllProducts()
  isGeneratingAll.value = false

  if (result) {
    const totalProducts = result.total
    const premiumCount = result.premium_count
    const totalQuestions = result.data?.reduce((sum: number, item: any) => sum + item.questions_count, 0) || 0

    toast.success(
      `Сгенерировано ${totalQuestions} базовых вопросов для ${totalProducts} товаров! `
      + `${premiumCount} премиум товаров требуют AI-генерацию`,
      { duration: 6000 },
    )
  }
  else {
    toast.error('Ошибка массовой генерации')
  }
}

onMounted(() => {
  if (products.value.length === 0)
    adminProductsStore.fetchProducts()
})

// Удаление
const productToDelete = ref<ProductListAdmin | null>(null)
const showDeleteDialog = ref(false)

function openDeleteDialog(product: ProductListAdmin) {
  productToDelete.value = product
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!productToDelete.value)
    return
  await adminProductsStore.deleteProduct(productToDelete.value)
  showDeleteDialog.value = false
  productToDelete.value = null
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8 space-y-6">
    <!-- Заголовок -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold tracking-tight">
          Управление товарами
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          {{ filteredProducts.length }} товаров
        </p>
      </div>
      <div class="flex gap-2 w-full sm:w-auto">
        <Button
          variant="outline"
          size="sm"
          :disabled="isGeneratingAll"
          class="hidden sm:inline-flex"
          @click="handleGenerateAllQuestions"
        >
          <Sparkles class="w-4 h-4 mr-2" :class="{ 'animate-spin': isGeneratingAll }" />
          {{ isGeneratingAll ? 'Генерация...' : 'FAQ для всех' }}
        </Button>
        <NuxtLink to="/admin/products/new" class="flex-1 sm:flex-initial">
          <Button class="w-full">
            <Plus class="w-4 h-4 mr-2" />
            Добавить товар
          </Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Поиск -->
    <Card>
      <CardContent class="pt-6">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            v-model="searchQuery"
            placeholder="Поиск по названию или категории..."
            class="pl-10"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <div v-for="i in 5" :key="i" class="flex items-center gap-4">
        <Skeleton class="w-12 h-12 rounded-md" />
        <div class="flex-1 space-y-2">
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="h-3 w-1/4" />
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Пустое состояние -->
      <Card v-if="filteredProducts.length === 0">
        <CardContent class="py-16 text-center">
          <div class="flex flex-col items-center gap-3 text-muted-foreground">
            <Package class="w-12 h-12 opacity-40" />
            <p v-if="searchQuery" class="text-lg font-medium">
              Ничего не найдено по "{{ searchQuery }}"
            </p>
            <p v-else class="text-lg font-medium">
              Товары ещё не добавлены
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Десктоп: таблица -->
      <Card v-else class="hidden md:block">
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">
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
              <TableRow v-for="product in filteredProducts" :key="product.id">
                <TableCell>
                  <div class="w-12 h-12 bg-muted rounded-md overflow-hidden flex items-center justify-center">
                    <span class="text-xs text-muted-foreground">IMG</span>
                  </div>
                </TableCell>
                <TableCell class="font-medium">
                  {{ product.name }}
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ product.categories?.name || 'Без категории' }}
                </TableCell>
                <TableCell>{{ formatPrice(product.price) }} ₸</TableCell>
                <TableCell>
                  <Badge :variant="product.stock_quantity <= 2 ? 'destructive' : 'secondary'">
                    {{ product.stock_quantity }} шт
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge :variant="product.is_active ? 'default' : 'outline'">
                    {{ product.is_active ? 'Активен' : 'Скрыт' }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal class="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="router.push(`/admin/products/${product.id}`)">
                        <Pencil class="w-4 h-4 mr-2" />
                        Редактировать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        @click="openDeleteDialog(product)"
                      >
                        <Trash2 class="w-4 h-4 mr-2" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Мобайл: карточки -->
      <div v-if="filteredProducts.length > 0" class="md:hidden space-y-3">
        <Card
          v-for="product in filteredProducts"
          :key="product.id"
          class="overflow-hidden"
          @click="router.push(`/admin/products/${product.id}`)"
        >
          <CardContent class="p-4">
            <div class="flex items-start gap-3">
              <!-- Картинка -->
              <div class="w-14 h-14 bg-muted rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                <span class="text-xs text-muted-foreground">IMG</span>
              </div>

              <!-- Инфо -->
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <p class="font-medium text-sm leading-tight truncate">
                    {{ product.name }}
                  </p>
                  <Badge :variant="product.is_active ? 'default' : 'outline'" class="flex-shrink-0 text-[10px]">
                    {{ product.is_active ? 'Активен' : 'Скрыт' }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ product.categories?.name || 'Без категории' }}
                </p>
                <div class="flex items-center gap-3 mt-2">
                  <span class="text-sm font-semibold">
                    {{ formatPrice(product.price) }} ₸
                  </span>
                  <Badge :variant="product.stock_quantity <= 2 ? 'destructive' : 'secondary'" class="text-[10px]">
                    {{ product.stock_quantity }} шт
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- AlertDialog удаления -->
    <AlertDialog v-model:open="showDeleteDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы собираетесь удалить товар <strong>"{{ productToDelete?.name }}"</strong>.
            Это действие необратимо.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDelete"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
